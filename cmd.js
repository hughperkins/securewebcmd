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

var nextJob = 0;
var jobs = [];

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

function serveStaticJs( filepath, response ) {
    serveStatic( filepath, 'text/javascript', response );
}

function serveStaticHtml( filepath, response ) {
    serveStatic( filepath, 'text/html', response );
}

function handleRequest( queryDic, response ) {
    var cmd = queryDic.cmd;
    var dir = queryDic.dir;
    var args = queryDic.args;
    if( typeof dir == 'undefined' ) {
        dir = '.';
    }
    if( typeof cmd == 'undefined' ) {
        cmd = '';
    }
    console.log(cmd);
    var check = queryDic.check;
    var ourcheck = md5.md5(password + '||' + dir + '||' + cmd );
    response.writeHead(200, {'Content-type': 'text/html; charset=utf-8' });
    console.log(check);
    console.log(ourcheck);
//    if( typeof args == 'undefined' ) {
//        args = '';
//    }
    response.write('<html>');
    response.write('<head>');
    response.write('<script src="md5.min.js"></script>');
    response.write('<script type="text/javascript">');
    response.write('function go() {' );
//        response.write('   var passvalue = window.prompt("password","");');
    response.write('   var passvalue = document.getElementById("pass").value;');
//        response.write('   alert( passvalue );' );
    response.write('   var dirvalue = document.getElementById("dir").value;');
    response.write('   var cmdvalue = document.getElementById("cmd").value;');
//    response.write('   var argsvalue = document.getElementById("args").value;');
    response.write('   var checktarget = passvalue + "||" + dirvalue + "||" + cmdvalue;');
    response.write('   var checkvalue = md5(checktarget);');
    response.write('   check.value = checkvalue;');
    response.write('   document.forms["myform"].submit();');
    response.write('}');
    response.write('</script>');
    response.write('</head>');
    response.write('<body>');
//    for( var i = 0; i < jobs.length; i++ ) {
//        response.write( jobs[i].cmd + '<form name="results"' + i + '" method="post" action="showresults">');
//        response.write( '<input type="hidden" name=
//        showresults?jobid=' + i + '</a><br/>' );
//        response.write( '</form>' );
//    }
    response.write('<form name="myform" method="post" action="/">');
    response.write('check: <input type="hidden" id="check" name="check" value=""></input>');
    response.write('dir: <input type="text" size="60" id="dir" name="dir" value="' + dir + '" onKeydown="Javascript: if (event.keyCode==13) go();"></input><br/>');
    response.write('cmd: <input size="140" type="text" id="cmd" name="cmd" value="' + cmd + '" onKeydown="Javascript: if (event.keyCode==13) go();"></input><br/>');
//    response.write('args: <input type="text" id="args" name="args" value="' + args + '" onKeydown="Javascript: if (event.keyCode==13) go();"></input>');
    if( isSsl ) {
        response.write('pass: <input type="password" id="pass" name="pass" value="' + queryDic.pass + '" onKeydown="Javascript: if (event.keyCode==13) go();"></input>');
    }
    response.write('</form>');
    if( !isSsl ) {
        response.write('pass: <input type="password" id="pass" name="pass"  onKeydown="Javascript: if (event.keyCode==13) go();"></input>');
    }
    response.write('<input type="button" value="Submit" onclick="go()" /><br />\n');

    if( typeof cmd != 'undefined' ) {
        if( check != ourcheck ) {
            response.write('password invalid');
            response.end();
        } else {
            var job = {};
            job['cmd'] = cmd;
            jobs[nextJob] = job;
            nextJob++;
            var splitcmd = cmd.split(' ' );
            var cmd1 = splitcmd[0];
            response.write('cmd: ' + cmd + '<br />\n' );
            options = {cwd: dir }
            if( splitcmd.length > 1 ) {
                var args = splitcmd.slice(1);
                var cmdobj = spawn( cmd1, args, options );
            } else {
                var cmdobj = spawn( cmd1, options );
            }
            job.cmdobj = cmdobj;
            job.cmd1 = cmd1;
            job.args = args;
            job.results = '';
            cmdobj.on('exit', function(code) {
                response.write('done, code: ' + code );
                response.end();
                job.finished = true;
            });
            cmdobj.on('error', function(code) {
                response.write('error, code: ' + code );
                response.end();
                job.finished = true;
            });
            cmdobj.stdout.on('data', function(data) {
                var thisresult = String(data).split('\n').join('<br/>\n' ).replace(/ /g, '&nbsp;' );
                job.results += thisresult;
                response.write( thisresult );
            });
            cmdobj.stderr.on('data', function(data) {
                response.write( 'stderr: ' + String(data).split('\n').join('<br/>\n' ).replace(/ /g, '&nbsp;' ) );
            });
            cmdobj.on('close', function (code) {
                response.write('child process exited with code ' + code);
                job.finished = true;
            });
        }
    } else {
        response.write('</body><html>');
        response.end();
    }
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
            //handleRequest(queryDic, response );
        });
    } else {
        var queryDic = url.parse( request.url, true ).query;
        request.queryDic = queryDic;
        callback( queryDic );
        //handleRequest( queryData, response );
    }
}

function serverFunction( request, response ) {
    var path = url.parse( request.url ).pathname;
    console.log('received request: ' + request.url );
    if( path == '/' ) {
        if( request.method == 'POST' ) {
            var queryData = '';
            var queryDic = '';
            request.on('data', function(data ) {
                queryData += data;
                if( queryData.length > 1e6 ) {
                    queryData = '';
                    response.writeHead(413, {'Content-Type': 'text/plain'}).end();
                    request.connection.destroy();
                }
            });
            request.on('end', function() {
                queryDic = querystring.parse(queryData);
                handleRequest(queryDic, response );
            });
        } else {
            var queryData = url.parse( request.url, true ).query;
            handleRequest( queryData, response );
        }
    } else if( path == '/run' ) {
        getQueryDic( request, function( queryDic ) {
            response.writeHead(200, {'Content-type': 'text/html; charset=utf-8' });
            response.write('hey. Response from cmd.js!');
            var cmd = queryDic.cmd;
            var dir = queryDic.dir;
            var theirCheck = queryDic.check;
            response.write('cmd: ' + cmd );
            response.write('dir: ' + dir );
            response.write('yourcheck: ' + theirCheck );
            response.end();
        });
    } else if( path == '/run2' ) {
        getQueryDic( request, function( queryDic ) {
            response.writeHead(200, {'Content-type': 'text/html; charset=utf-8' });
            response.write('hey. you called run2. Response from cmd.js!');
            var cmd = queryDic.cmd;
            var dir = queryDic.dir;
            var theirCheck = queryDic.check;
            response.write('cmd: ' + cmd );
            response.write('dir: ' + dir );
            response.write('yourcheck: ' + theirCheck );
//            response.end();
            var splitcmd = cmd.split(' ' );
            var cmd1 = splitcmd[0];
            response.write('cmd1: ' + cmd + '<br />\n' );
            options = {cwd: dir }
            if( splitcmd.length > 1 ) {
                var args = splitcmd.slice(1);
                response.write('has args: ' + args + '<br />');
                var cmdobj = spawn( cmd1, args, options );
            } else {
                response.write('no args<br/>');
                var cmdobj = spawn( cmd1, options );
            }
            response.write('cmd1: ' + cmd1 );
            cmdobj.on('exit', function(code) {
                response.write('done, code: ' + code );
                response.end();
//                job.finished = true;
            });
            cmdobj.on('error', function(code) {
                response.write('error, code: ' + code );
                response.end();
  //              job.finished = true;
            });
            cmdobj.stdout.on('data', function(data) {
                var thisresult = String(data).split('\n').join('<br/>\n' ).replace(/ /g, '&nbsp;' );
    //            job.results += thisresult;
                response.write( thisresult );
            });
            cmdobj.stderr.on('data', function(data) {
                response.write( 'stderr: ' + String(data).split('\n').join('<br/>\n' ).replace(/ /g, '&nbsp;' ) );
            });
            cmdobj.on('close', function (code) {
                response.write('child process exited with code ' + code);
                response.end();
      //          job.finished = true;
            });
        });
    } else if( path == '/md5.min.js' ) {
        serveStaticJs( md5jspath + '/md5.min.js', response);
    } else if( path == '/index.html' ) {
        serveStaticHtml( __dirname + '/index.html', response);
    } else if( path == '/jquery-1.11.2.min.js' ) {
        serveStaticJs( __dirname + '/jquery-1.11.2.min.js', response);
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
        https.createServer( options, serverFunction ).listen(8888);
        console.log('key.pem and cert.pem detected: started using https protocol, use https:// to connect, port 8888');
    } else {
        http.createServer( serverFunction ).listen(8888);
        console.log('started using http protocol, use http:// to connect, port 8888');
    }
}

