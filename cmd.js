// Copyright Hugh Perkins 2015 hughperkins at gmail
//
// This Source Code Form is subject to the terms of the Mozilla Public License, 
// v. 2.0. If a copy of the MPL was not distributed with this file, You can 
// obtain one at http://mozilla.org/MPL/2.0/.

var http = require('http');
var https = require('https');
var spawn = require('child_process').spawn;
var fs = require('fs');
var path = require('path');
var bodyParser = require('body-parser');
var md5 = require( 'blueimp-md5');
var prompt = require( 'prompt');
var express = require('express');
var compression = require('compression');
var util = require('util');
require('string.prototype.endswith');

var md5path = path.dirname( require.resolve('blueimp-md5') );
var jquerypath = path.dirname( require.resolve('jquery') );
var angularpath = path.dirname( require.resolve('angular' ) );
var bootstrappath = path.dirname( path.dirname( require.resolve( 'bootstrap' ) ) );

auth = true; // should be true for prod...

//var nextJob = 0;
var jobs = [];
var currentJob = null;
var queuedJobs = [];

//var inProgress = {};
//var nextProgressIndex = 0;

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
if( auth ) {
    prompt.start();
    prompt.get(schema, function( err, result ) {
        password = result.password;
        if( password != result.passwordcheck ) {
            console.log("error: password mismatch");
        } else {
            startServer();
        }
    });
} else {
    console.log('WARNING: authorization disabled, development environment only...');
    startServer();
}
            
if( fs.existsSync( __dirname + '/jobs.json' ) ) {
    jobs = JSON.parse(fs.readFileSync(__dirname + '/jobs.json', 'utf8'));
}

function checkPass( checkpass ) {
//    console.log('checkpass( ' + checkpass + ' )');
    var splitcheckpass = checkpass.split('|');
    var salt = splitcheckpass[0];
    var checksum = splitcheckpass[1];
    var ourchecksum = md5.md5( salt + '|' + password );
//    console.log( 'ourchecksum: ' + ourchecksum );
//    console.log( 'theirchecksum: ' + checkpass );
    return ourchecksum == checksum;
}

function requestToDic( request ) {
    var result = {};
    util._extend( result, request.body );
    util._extend( result, request.query );
    return result;
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

function getJobIndex( jobId ) {
    for( var i in jobs ) {
        if( jobs[i].id == jobId ) {
            return i;
        }
    }
    return -1;
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

    console.log('Starting job', job);

    if( job.args.length > 0 ) {
        console.log('has args: ' + args + '<br />');
        var cmdobj = spawn( cmd1, args, options );
    } else {
        console.log('no args<br/>');
        var cmdobj = spawn( cmd1, options );
    }
    job.cmdobj = cmdobj;

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
    cmdobj.on('error', function (code) {
        job.results += 'child process exited with code: ' + code + '\n';
        runEvent( job.onclose, code );
        console.log('error ' + code);
        jobFinished( job );
        writeJobs();
    });
}

function run2( request, response ) {
//    console.log('request for /run2');
    response.writeHead(200, {'Content-type': 'application/json; charset=utf-8;' });
//    console.log('request.body:', request.body );
    var cmd = request.query2.cmd;
    var dir = request.query2.dir;
    if( auth ) {
        var theirCheck = request.query2.check;
//        console.log('cmd: ' + cmd );
//        console.log('dir: ' + dir );
        var stringToCheck = password + '||' + dir + '||' + cmd;
//        console.log('stringToCheck: [' + stringToCheck + ']' );
        var ourCheck = md5.md5( stringToCheck );
//        console.log('their check: ' + theirCheck );
//        console.log('our check: ' + ourCheck );
        if( theirCheck != ourCheck ) {
            response.end(JSON.stringify({'result': 'fail', 'error': 'checksum error' } ) );
            return;
        }
    }
//            response.end();
    var splitcmd = cmd.split(' ' );
    var cmd1 = splitcmd[0];
    var args = [];
    if( splitcmd.length > 1 ) {
        args = splitcmd.slice(1);
    }
//    console.log('cmd1: ' + cmd + '<br />\n' );
//    console.log('cmd1: ' + cmd1 );
    job = { 'cmd': cmd1, 'args': args, 'state': 'waiting', 'done': false, 'results': '', 'dir': dir };
    job.ondata = [];
    job.onclose = [];
//            job.onexit = [];
    job.dir = dir;
    job.id = jobs[ jobs.length - 1].id + 1;
    jobs[ jobs.length ] = job;
//    job.id = jobs.length - 1;
    console.log('request received for new job:', job );

    if( currentJob == null ) {
        startJob( job );
    } else {
        queuedJobs[ queuedJobs.length ] = job;
        job.state = 'queued';
    }

    var results = { 'id': job.id , 'result': 'success', 'cmd': job.cmd, 'args': job.args, 'done': job.done, 'state': job.state, 'dir': job.dir };
//    console.log('results:', results );
//    console.log('finished run2 method');
    response.end(JSON.stringify(results) );
}

function getJob( request, response ) {
    // sameorigin option means we can display it in iframe with no security issues
    response.writeHead(200, {'Content-type': 'text/plain; charset=utf-8', 'x-frame-options': 'SAMEORIGIN' });
    var jobId = request.query2.jobId;
//    console.log('requested jobid: ' + jobId );
    var index = getJobIndex( jobId );
    var job = jobs[index];
//    console.log('job: ', job );
    if( typeof job == 'undefined' ) {
        response.write('job unknown');
        response.end();
        return;
    }
    if( job.done ) {  // just provide the results
        response.write( job.results);
        response.end();
    } else if( job.state == 'queued' ) { // add listeners for when it starts
        response.write('waiting on queue...\n');
        job.ondata.push( function( data ) {
            response.write( String(data) );
        });
        job.onclose.push( function( code ) {
            response.write('done, code: ' + code );
            response.end();
        });
    } else { // write the output of cmdobj, as it happens...
//        console.log('output cmdobj results as happen...');
//        console.log(job.results);
        response.write( job.results );
        var cmdobj = job.cmdobj;
//        console.log('adding listeners...');
        cmdobj.stdout.on('data', function(data) {
//            console.log('got data... ');
//            console.log(String(data) );
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
//    console.log('finished job method');
}

function getJobs( request, response ) {
    response.writeHead(200, {'Content-type': 'application/json; charset=utf-8' } );
    response.end( JSON.stringify( listToFilteredList( jobs, ['done','cmd','id','state','args', 'dir'] ) ) );
}

function kill( request, response ) {
    response.writeHead(200, {'Content-type': 'application/json; charset=utf-8' } );
    var id = request.query2.id;
    var index = getJobIndex( id );
//    console.log('killing id: ' + id );
    var job = jobs[index];
//    console.log('killing job', job );
    job.cmdobj.kill();
    var result = {'result': 'success'};
    response.end( JSON.stringify( result ) );
}

function remove( request, response ) {
    response.writeHead(200, {'Content-type': 'application/json; charset=utf-8' } );
    var id = request.query2.id;
    var index = getJobIndex( id );
//    console.log('Removing job', jobs[index] );
    jobs.splice(index,1);
    writeJobs();
    var result = {'result': 'success'};
    response.end( JSON.stringify( result ) );
}

function shouldCompress(req, res) {
//    console.log( req.query2 );
    if (req.headers['x-no-compression'] ) {
        return false
    }

    if( typeof req.query2 != 'undefined' ) {
        if( req.query2.nocompress == '1' ) {
            return false;
        }
    }
    return compression.filter(req, res)
}

var app = express();
//var router = express.Router();

//app.use( function( request, response, next ) {
//    console.log( 'url: ' + request.url );
//    if( request.url == '/' ) {
//        request.url = '/gzip/index.html';
//    }
//    next();
//});

app.use(compression({filter: shouldCompress}));
app.use( bodyParser.json() ); // note: angular uses json, jquery uses urlencoded

app.use( express.static(path.join( __dirname + '/public' ) ) ); // server pages from public directory
app.use( '/md5', express.static( md5path ) ); // serve md5 js pages
app.use( '/jquery', express.static( jquerypath ) ); // serve jquery js pages
app.use( '/angular', express.static( angularpath ) );
app.use( '/bootstrap', express.static( bootstrappath ) );
app.get( '/', function( req, res ) {
    res.sendFile( __dirname + '/public/index.html' );
});

app.use( function( request, response, next ) { // then we can always use req.query2[somekey]
                                               // no matter post or get
    request.query2 = requestToDic( request );
    next();
});
app.use('/run2', run2 );
app.use( function( request, response, next ) {
    if( !auth ) {
        next();
        return;
    }
    // add filter for password
    console.log( request.path );
//    console.log( 'request.body: ', request.body );
    var checkpass = request.query2.checkpass;
//    console.log('checkpass: ' + checkpass );
    if( typeof checkpass == 'undefined' || !checkPass( checkpass ) ) {
        response.writeHead(200, {'Content-type': 'application/json; charset=utf-8' } );
        response.end(JSON.stringify( { 'result': 'fail', 'error': 'checksum mismatch, check password' }, 0, 4 ) );
        return;
    }
//    console.log('pass ok :-)' );
    next();
});
app.use('/job', getJob );
app.use('/kill', kill );
app.use('/remove', remove );
app.use('/jobs', getJobs );
//app.use( '/', dynamicRouter );

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
                app( request, response );
            } catch( e ) {
                console.log('something went wrong:' + e );
                response.end('something went wrong ' + e);
            }
        } ).listen(8888);
        console.log('key.pem and cert.pem detected: started using https protocol, use https:// to connect, port 8888');
    } else {
        http.createServer( function(request, response) {
            try {
                app(request,response);
            } catch( e ) {
                console.log('something went wrong:' + e );
                response.end('something went wrong ' + e);
            }
        } ).listen(8888);
        console.log('key.pem and cert.pem not detected: started using http protocol, use http:// to connect, port 8888');
    }
}

//setInterval( function() {
//    console.log( inProgress );
//}, 1000 );



