// Copyright Hugh Perkins 2015 hughperkins at gmail
//
// This Source Code Form is subject to the terms of the Mozilla Public License, 
// v. 2.0. If a copy of the MPL was not distributed with this file, You can 
// obtain one at http://mozilla.org/MPL/2.0/.

var http = require('http');
var https = require('https');
var url = require('url');
var spawn = require('child_process').spawn;
var fs = require('fs');
var path = require('path');
var md5 = require( 'blueimp-md5');
var prompt = require( 'prompt');
var querystring = require('querystring');

var md5jspath = path.dirname( require.resolve('blueimp-md5') );
var jquerypath = path.dirname( require.resolve('jquery') );

//var nextJob = 0;
var jobs = [];
var currentJob = null;
var queuedJobs = [];

var schema = {
    properties: {
        password: {
            hidden: true
        },
        passwordcheck: {
            hidden: true
        }
    }
};

var password = '';
prompt.start();
prompt.get(schema, function( err, result ) {
    password = result.password;
    if( password != result.passwordcheck ) {
        console.log("error: password mismatch");
    } else {
        startServer();
    }
});
            
if( fs.existsSync( __dirname + '/jobs.json' ) ) {
    jobs = JSON.parse(fs.readFileSync(__dirname + '/jobs.json', 'utf8'));
}

function serveStatic( filepath, type, response ) {
    var filepath = filepath;
//    console.log( 'filepath: [' + filepath + ']');
    var stat = fs.statSync( filepath );
    response.writeHead(200, { 'Content-Type': type, 'Content-Length': stat.size });
    var readStream = fs.createReadStream( filepath );
    readStream.on('open', function() {
        readStream.pipe( response );
    });
    readStream.on('error', function(err) {
        response.end(err);
    });
}

function checkPass( checkpass ) {
    var splitcheckpass = checkpass.split('|');
    var salt = splitcheckpass[0];
    var checksum = splitcheckpass[1];
    var ourchecksum = md5.md5( salt + '|' + password );
    console.log( 'ourchecksum: ' + ourchecksum );
    console.log( 'theirchecksum: ' + checkpass );
    return ourchecksum == checksum;
}

function listToFilteredList( list, properties ) {
    var filteredList = [];
    var keys = Object.keys( list );
    for( var i = 0; i < keys.length; i++ ) {
        var item = list[i];
        var newItem = {};
        for( var j = 0; j < properties.length; j++ ) {
            var prop = properties[j];
            newItem[prop] = item[prop];
        }
//        var newItem = { 'id': job.id, 'cmd': job.cmd, 'args': job.args, 'done': job.done, 'dir': job.dir };
        filteredList[i] = newItem;
    }
    return filteredList;    
}

function serveStaticJs( filepath, response ) {
    serveStatic( filepath, 'text/javascript', response );
}

function serveStaticHtml( filepath, response ) {
    serveStatic( filepath, 'text/html', response );
}

function getQueryDic( request, callback ) {
    if( request.method == 'POST' ) {
        var queryData = '';
        var queryDic = '';
        request.on('data', function(data ) {
            queryData += data;
//            if( queryData.length > 1e6 ) {
//                queryData = '';
////                response.writeHead(413, {'Content-Type': 'text/plain'}).end();
//                request.connection.destroy();
//            }
        });
        request.on('end', function() {
            queryDic = querystring.parse(queryData);
            request.queryDic = queryDic;
            callback( queryDic );
        });
    } else {
        var queryDic = url.parse( request.url, true ).query;
        request.queryDic = queryDic;
        callback( queryDic );
    }
}

function setListAttr( list, prop, value ) {
    var keys = Object.keys( list );
    for( var i = 0; i < keys.length; i++ ) {
        list[i][prop] = value;
    }
    return list;
}

function filterList( list, prop, removeValue ) {
    var newList = [];
    var keys = Object.keys( list );
    for( var i = 0; i < keys.length; i++ ) {
        if( list[i][prop] != removeValue ) {
            newList[newList.length] = list[i];
        }
    }
    return newList;
}

function writeJobs() {
    var jobsToWrite = listToFilteredList( jobs, ['id','cmd','args','done', 'results', 'dir', 'state' ] );
    jobsToWrite = filterList( jobsToWrite, 'state', 'queued' );
    setListAttr( jobsToWrite, 'done', true );
    setListAttr( jobsToWrite, 'state', 'done' );
    fs.writeFileSync(__dirname + '/tempjobs.json', JSON.stringify(jobsToWrite), 'utf8' );
    if( fs.existsSync(__dirname + '/jobs.json' ) ) {
        //fs.unlinkSync(__dirname + '/jobs.json' );
    }
    fs.renameSync( __dirname + '/tempjobs.json', __dirname + '/jobs.json' );
}

function jobFinished( job ) {
    job.done = true;
    job.state = 'done';
    currentJob = null;
    if( queuedJobs.length > 0 ) {
        var nextJob = queuedJobs.shift();
        currentJob = nextJob;
        startJob( nextJob );
    }
}

function runEvent( list, eventArg ) {
    var keys = Object.keys( list );
    for( var i = 0; i < keys.length; i++ ) {
        list[i]( eventArg );
    }
}

function startJob( job ) {
    currentJob = job;
    job.state = 'running';
    var dir = job.dir;
    var cmd1 = job.cmd;
    var args = job.args;
    options = {cwd: job.dir }

    console.log('start');

    if( job.args.length > 0 ) {
        console.log('has args: ' + args + '<br />');
        var cmdobj = spawn( cmd1, args, options );
    } else {
        console.log('no args<br/>');
        var cmdobj = spawn( cmd1, options );
    }
    job.cmdobj = cmdobj;

//    cmdobj.on('exit', function(code) {
//        console.log('exit');
//        job.results += 'done, code: ' + code + '\n';
//        runEvent( job.onexit, code );
//        //jobFinished( job );
//        writeJobs();
//    });
//    cmdobj.on('error', function(code) {
//        console.log('error');
//        job.results += 'error, code: ' + code + '\n';
//        runEvent( job.onerror, code );
//        //jobFinished( job );
//        writeJobs();
//    });
    cmdobj.stdout.on('data', function(data) {
        runEvent( job.ondata, data );
        job.results += String(data);
        writeJobs();
    });
    cmdobj.stderr.on('data', function(data) {
        runEvent( job.ondata, data );
        job.results += String(data);
    });
    cmdobj.on('close', function (code) {
        job.results += 'child process exited with code: ' + code + '\n';
        runEvent( job.onclose, code );
        console.log('close');
        jobFinished( job );
        writeJobs();
    });
}

function serverFunction( request, response ) {
    var path = url.parse( request.url ).pathname;
    console.log('received request: ' + request.url );
    if( path == '/run2' ) {
        getQueryDic( request, function( queryDic ) {
            response.writeHead(200, {'Content-type': 'application/json' });
            var cmd = queryDic.cmd;
            var dir = queryDic.dir;
            var theirCheck = queryDic.check;
            console.log('cmd: ' + cmd );
            console.log('dir: ' + dir );
            var ourCheck = md5.md5( password + '||' + dir + '||' + cmd );
            console.log('their check: ' + theirCheck );
            console.log('our check: ' + ourCheck );
            if( theirCheck != ourCheck ) {
                response.end(JSON.stringify({'result': 'fail', 'error': 'checksum error' } ) );
                return;
            }
//            response.end();
            var splitcmd = cmd.split(' ' );
            var cmd1 = splitcmd[0];
            var args = [];
            if( splitcmd.length > 1 ) {
                args = splitcmd.slice(1);
            }
            console.log('cmd1: ' + cmd + '<br />\n' );
            console.log('cmd1: ' + cmd1 );
            job = { 'cmd': cmd1, 'args': args, 'state': 'waiting', 'done': false, 'results': '', 'dir': dir };
            job.ondata = [];
            job.onclose = [];
//            job.onexit = [];
            job.dir = dir;
            jobs[ jobs.length ] = job;
            job.id = jobs.length - 1;
            console.log('job: ' + job );

            if( currentJob == null ) {
                startJob( job );
            } else {
                queuedJobs[ queuedJobs.length ] = job;
                job.state = 'queued';
            }

            response.end(JSON.stringify({ 'id': job.id , 'result': 'success', 'cmd': job.cmd, 'args': job.args, 'done': job.done, 'state': job.state, 'dir': job.dir }) );
        });
    } else if( path == '/job' ) {
        getQueryDic( request, function( queryDic ) {
            response.writeHead(200, {'Content-type': 'text/plain; charset=utf-8' });
            if( !checkPass( queryDic.saltedpass ) ) {
                response.end( JSON.stringify( { 'result': 'fail', 'error': 'invalid pass' } ) );
                return;
            }
            var jobId = queryDic.jobId;
            console.log('requested jobid: ' + jobId );
            var job = jobs[jobId];
            console.log('job: ' + job );
            if( typeof job == 'undefined' ) {
                response.write('job unknown');
                response.end();
                return;
            }
            if( job.done ) {
                response.write( job.results);
                response.end();
            } else if( job.state == 'queued' ) {
                response.write('waiting on queue...\n');
                job.ondata.push( function( data ) {
                    response.write( String(data) );
                });
                job.onclose.push( function( code ) {
                    response.write('done, code: ' + code );
                    response.end();
                });
//                job.onerror.push( function( code ) {
//                    response.write('error, code: ' + code );
//                    response.end();
//                });
            } else {
                response.write( job.results );
                var cmdobj = job.cmdobj;
//                cmdobj.on('exit', function(code) {
//                    response.write('done, code: ' + code );
//                    response.end();
//                });
//                cmdobj.on('error', function(code) {
//                    response.write('error, code: ' + code );
//                    response.end();
//                });
                cmdobj.stdout.on('data', function(data) {
                   response.write( String(data) );
                });
                cmdobj.stderr.on('data', function(data) {
                    response.write( 'stderr: ' + String(data) );
                });
                cmdobj.on('close', function (code) {
                    response.write('child process exited with code ' + code);
                    response.end();
                });
            }
        });
    } else if( path == '/jobs' ) {
        getQueryDic( request, function( queryDic ) {
//            console.log( 'queryDic: ' + queryDic );
            response.writeHead(200, {'Content-type': 'application/json; charset=utf-8' } );
            if( !checkPass( queryDic.saltedpass ) ) {
                response.end( JSON.stringify( { 'result': 'fail', 'error': 'invalid pass' } ) );
                return;
            }
            response.end( JSON.stringify( listToFilteredList( jobs, ['done','cmd','id','state','args', 'dir'] ) ) );
        });
    } else if( path == '/kill' ) {
        getQueryDic( request, function( queryDic ) {
            response.writeHead(200, {'Content-type': 'application/json; charset=utf-8' } );
            if( !checkPass( queryDic.saltedpass ) ) {
                response.end( JSON.stringify( { 'result': 'fail', 'error': 'invalid pass' } ) );
                return;
            }
            var id = queryDic.id;
            console.log('killing id: ' + id );
            var job = jobs[id];
            console.log('job: ' + job );
            job.cmdobj.kill();
            var result = {'result': 'success'};
            response.end( JSON.stringify( result ) );
        });
    } else if( path == '/md5.min.js' ) {
        serveStaticJs( md5jspath + '/md5.min.js', response);
    } else if( path == '/index.html' || path == '/' ) {
        serveStaticHtml( __dirname + '/index.html', response);
    } else if( path == '/jquery.min.js' ) {
        serveStaticJs( jquerypath + '/jquery.min.js', response);
    } else {
        response.write('page ' + path + ' not known');
        response.end();
    }
}

var isSsl = false;

function startServer() {
    if( fs.existsSync( __dirname + '/key.pem' ) && fs.existsSync( __dirname + '/cert.pem' ) ) {
        var options = {
            key: fs.readFileSync( __dirname + '/key.pem' ),
            cert: fs.readFileSync( __dirname + '/cert.pem' )
        };
        isSsl = true;
        https.createServer( options, function(request, response) {
            try {
                serverFunction(request,response);
            }catch( e ) {
                console.log('something went wrong:' + e );
                response.end('something went wrong ' + e);
            }
        } ).listen(8888);
        console.log('key.pem and cert.pem detected: started using https protocol, use https:// to connect, port 8888');
    } else {
        //console.log("sorry, running as http isn't supported any more.  Please create a key.pem and cert.pem file, so we can use https");
        http.createServer( function(request, response) {
            try {
                serverFunction(request,response);
            }catch( e ) {
                console.log('something went wrong:' + e );
                response.end('something went wrong ' + e);
            }
        } ).listen(8888);
        console.log('key.pem and cert.pem not detected: started using http protocol, use http:// to connect, port 8888');
    }
}

