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

var auth = true; // should be true for prod...
if( process.env.NOAUTH == 1 ) {
    auth = false;
    console.log('WARNING: disabled authorization.  unset NOAUTH, and restart, to enable');
}

var showIframe = 'no'; // should be false for prod
if( process.env.SHOWIFRAME == 1 ) {
    showIframe = 'yes';
}

var whitelist = [];
if( typeof process.env.WHITELIST != 'undefined' ) {
    whitelist = process.env.WHITELIST.split(' ' );
    console.log('whitelist activated, list: ' + whitelist );
}

var jobsFilepath = 'jobs.json';
if( typeof process.env.JOBSFILE != 'undefined' ) {
    jobsFilepath = process.env.JOBSFILE;
    console.log('settings jobs filepath to ' + jobsFilepath );
}

var port = process.env.PORT || 8888;
console.log('Using port: ' + port );

var jobs = [];
var currentJob = null;
var queuedJobs = [];

var schema = {
    properties: {
        password: { hidden: true },
        passwordcheck: { hidden: true }
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
            
if( fs.existsSync( jobsFilepath ) ) {
    jobs = JSON.parse(fs.readFileSync( jobsFilepath, 'utf8'));
}

function myEquals( a, b ) {
    return JSON.stringify(a) == JSON.stringify(b);
}

function checkPass( checkpass ) {
    var splitcheckpass = checkpass.split('|');
    var salt = splitcheckpass[0];
    var checksum = splitcheckpass[1];
    var ourchecksum = md5.md5( salt + '|' + password );
    return ourchecksum == checksum;
}

function requestToDic( request ) {
    var result = {};
    util._extend( result, request.body );
    util._extend( result, request.query );
    return result;
}

function filterObject( item, properties ) {
    var newItem = {};
    for( var j = 0; j < properties.length; j++ ) {
        var prop = properties[j];
        newItem[prop] = item[prop];
    }
    return newItem;
}

function objectIndex( targetList, object, keyName ) {
    for( i in Object.keys( targetList ) ) {
        if( targetList[i][keyName] == object[keyName] ) {
            return i;
        }
    }
    return -1;
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
    fs.writeFileSync( jobsFilepath + '~', JSON.stringify(jobsToWrite), 'utf8' );
    fs.renameSync( jobsFilepath + '~', jobsFilepath );
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

    console.log('exe: [' + job.exe + ']');
    console.log('args: [' + job.args + '] length: ' + job.args.length );
    console.log('dir: [' + job.dir + ']' );

    if( whitelist.length > 0 ) {
        if( whitelist.indexOf( job.exe ) < 0 ) {
            console.log('job not in whitelist, cmd ', job.exe );
            job.done = true;
            job.state = 'done';
            job.results = 'requested command not in whitelist\n';
            job.results += 'whitelisted commands: ' + whitelist + '\n';
            job.results += 'you requested to run command (ignoring arguments): ' + job.exe + '\n';
            runEvent( job.ondata, job.results );
            runEvent( job.onclose, -1 );
            jobFinished( job );
            writeJobs();
            return;
        }
    }

    console.log('Starting job', job);

    var options = {cwd: job.dir }
    if( job.args.length > 0 ) {
        console.log('has args: ' + job.args + '<br />');
        var cmdobj = spawn( job.exe, job.args, options );
    } else {
        console.log('no args<br/>');
        var cmdobj = spawn( job.exe, options );
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

function getJob( request, response ) {
    // sameorigin option means we can display it in iframe with no security issues
    response.writeHead(200, {'Content-type': 'text/plain; charset=utf-8', 'x-frame-options': 'SAMEORIGIN' });
    var jobId = request.params.id; // request.query2.jobId;
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

app.use(compression({filter: shouldCompress}));
app.use( bodyParser.json() ); // note: angular uses json, jquery uses urlencoded

app.use( express.static(path.join( __dirname + '/public' ) ) ); // server pages from public directory
app.use( '/md5', express.static( md5path ) ); // serve md5 js pages
app.use( '/jquery', express.static( jquerypath ) ); // serve jquery js pages
app.use( '/angular', express.static( angularpath ) );
app.use( '/angular-resource', express.static( path.dirname( require.resolve('angular-resource' ) ) ) );
app.use( '/thirdparty', express.static( __dirname + '/thirdparty' ) );
app.use( '/bootstrap', express.static( bootstrappath ) );
app.get( '/', function( req, res ) {
    res.sendFile( __dirname + '/public/index.html' );
});

app.use( function( request, response, next ) { // then we can always use req.query2[somekey]
                                               // no matter post or get
    request.query2 = requestToDic( request );
    next();
});
app.post('/api/jobs', function( req,res ) {
    var job = req.body;
    console.log('post for ', job );
    if( auth ) {
        var theirCheck = req.headers['auth-token'];
        var stringToCheck = password + '||' + job.dir + '||' + job.cmd;
        var ourCheck = md5.md5( stringToCheck );
        if( theirCheck != ourCheck ) {
            console.log('failed auth');
            res.writeHead('403');
            res.end();
            return;
        }
    }
    var splitcmd = job.cmd.split(' ' );
    job.exe = splitcmd[0].trim();
    job.args = [];
    if( splitcmd.length > 1 ) {
        job.args = splitcmd.slice(1);
    }
    job.state = 'waiting';
    job.done = false;
    job.results = '';
    job.ondata = [];
    job.onclose = [];
    if( jobs.length > 0 ) {
        job.id = jobs[ jobs.length - 1].id + 1;
    } else {
        job.id = 1;
    }
    jobs[ jobs.length ] = job;
    console.log('request received for new job:', job );

    if( currentJob == null ) {
        startJob( job );
    } else {
        queuedJobs[ queuedJobs.length ] = job;
        job.state = 'queued';
    }
    res.writeHead( 201, { 'Content-type': 'application/json; charset: utf-8;',
        'Location': '/api/jobs/' + job.id } );
    res.end(JSON.stringify(filterObject( job, 
        ['id','result', 'args', 'done', 'state', 'dir', 'exe', 'cmd' ] ) ) );
});
app.use( function( request, response, next ) {
    if( !auth ) {
        next();
        return;
    }
    // add filter for password
    console.log( request.path );
    var checkpass = request.query2.checkpass;
    if( 'auth-token' in request.headers ) {
        checkpass = request.headers['auth-token'];
    }
    if( typeof checkpass == 'undefined' || !checkPass( checkpass ) ) {
        response.writeHead( 401, { 'Content-type': 'application/json; charset=utf8;' } );
        response.end(JSON.stringify({'detail': 'Unauthorized' } ) );
        return;
    }
    next();
});
function illegalRequest( description, res ) {
    writeErrorMessage( res, 400, description );
}
app.get('/api/jobs/:id/results', getJob );
app.post('/api/jobs/:id', function( req, res ) {
    var id = req.params.id;
    var updatedJob = req.body;

    var index = getJobIndex( id );
    if( index == -1 ) {
        writeErrorMessage( res, 404, 'Job id ' + id + ' not found' );
        return;
    }
    var currentJob = jobs[index];

    var changedKeys = [];
    for( var key in updatedJob ) {
        if( !myEquals( updatedJob[key], currentJob[key] ) ) {
            changedKeys.push( key );
        }
    }
    console.log( 'changed keys: ', changedKeys );
    if( changedKeys.length != 1 || changedKeys[0] != 'state' ) {
        writeErrorMessage( res, 400, 'can only modify \'state\' value' );
        return;
    }
    if( currentJob.state != 'running' ) {
        writeErrorMessage( res, 400, 'can only kill running jobs' );
        return;
    }
    if( updatedJob.state != 'done' ) {
        writeErrorMessage( res, 400, 'can only change state to \'done\'' );
        return;
    }
    console.log('killing job ' + currentJob.id );
    currentJob.cmdobj.kill();
//    jobFinished( currentJob );
    writeSuccessMessage( res, 200, 'killed job ' + id );
} );

function writeSuccessMessage( res, status, message ) {
    console.log( 'OK ' + status + ' ' + message );
    res.writeHead( status, { 'Content-type': 'application/json; charset=utf8;' } );
    res.end( JSON.stringify( {'detail': message } ) );
}
function writeErrorMessage( res, status, message ) {
    console.log( 'FAIL ' + status + ' ' + message );
    res.writeHead( status, { 'Content-type': 'application/json; charset=utf8;' } );
    res.end( JSON.stringify( {'detail': message } ) );
}

app.delete('/api/jobs/:id', function( req, res ) {
    var id = req.params.id;
    console.log('removing id: ' + id );
    var index = getJobIndex( id );
    if( index == -1 ) {
        writeErrorMessage( res, 'job id ' + id + ' not found' );
    } else {
        var job = jobs[index];
        if( job.state == 'running' ) {
            illegalRequest('cant remove a job that is running');
            return;
        }
        if( job.state == 'queued' ) {
            var queuedIndex = objectIndex( queuedJobs, job, 'id' );
            queuedJobs.splice( queuedIndex, 1 );
        }
        jobs.splice( index, 1 );
        writeSuccessMessage( res, 200, 'deleted job id ' + id );
    }
} );
app.get('/api/config', function( req, res ) {
    res.writeHead(200, {'Content-type': 'application/json; charset=utf-8' } );
    res.end( JSON.stringify( { 'showiframe': showIframe } ) );
});
app.get('/api/jobs', function( req, res ) {
    res.writeHead(200, {'Content-type': 'application/json; charset=utf-8' } );
    res.end( JSON.stringify( listToFilteredList( jobs, ['done','cmd','id','state','args', 'dir'] ) ) );
});

var isSsl = false;

function startServer() {
    if( fs.existsSync( 'key.pem' ) && fs.existsSync( 'cert.pem' ) ) {
        var options = {
            key: fs.readFileSync( 'key.pem' ),
            cert: fs.readFileSync( 'cert.pem' )
        };
        isSsl = true;
        https.createServer( options, function(request, response) {
            try {
                app( request, response );
            } catch( e ) {
                console.log('something went wrong:' + e );
                response.end('something went wrong ' + e);
            }
        } ).listen(port);
        console.log('Using https, since key.pem and cert.pem present.  All communications will be encrypted using ssl. Use https:// to connect, port ' + port );
    } else {
        http.createServer( function(request, response) {
            try {
                app(request,response);
            } catch( e ) {
                console.log('something went wrong:' + e );
                response.end('something went wrong ' + e);
            }
        } ).listen(port);
        console.log('Using http, since key.pem and cert.pem not present. Use http:// to connect, port ' + port );
    }
}


