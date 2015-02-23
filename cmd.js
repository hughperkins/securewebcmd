var http = require('http');
var url = require('url');
var spawn = require('child_process').spawn;
var fs = require('fs');
//var readline = require('readline');
var md5 = require(__dirname + '/node_modules/blueimp-md5');
var prompt = require( __dirname + '/node_modules/prompt');

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
    }
});
            

//var rl = readline.createInterface({
//    input: process.stdin,
//    output: process.stdout
//});
//var password = '';
//rl.question('password: ', function(answer) {
//    password = answer;
//    rl.close();
//});

function replaceGlobal( target, oldValue, newValue ) {
    
}

function serveStaticJs( filename, response ) {
    var filepath = __dirname + '/' + filename;
    console.log( 'filepath: [' + filepath + ']');
    var stat = fs.statSync( filepath );
    response.writeHead(200, { 'Content-Type': 'text/javascript', 'Content-Length': stat.size });
    var readStream = fs.createReadStream( filepath );
    readStream.on('open', function() {
        readStream.pipe( response );
    });
    readStream.on('error', function(err) {
        response.end(err);
    });
}

http.createServer( function( request, response ) {
    var path = url.parse( request.url ).pathname;
    console.log('path: [' + path + ']');
    if( path == '/' ) {
//    if( path == '/run' ) {
//    response.writeHead(200, {'Content-type': 'text/plain' });
        response.writeHead(200, {'Content-type': 'text/html; charset=   utf-8' });
    var queryData = url.parse( request.url, true ).query;
    var cmd = queryData.cmd;
    var args = queryData.args;
    var check = queryData.check;
    var ourcheck = md5.md5(password + '||' + cmd + '||' + args );
    console.log(check);
    console.log(ourcheck);
    if( typeof args == 'undefined' ) {
        args = '';
    }
        response.write('<html>');
        response.write('<head>');
        response.write('<script src="md5.min.js"></script>');
        response.write('<script type="text/javascript">');
        response.write('function go() {' );
//        response.write('   var passvalue = window.prompt("password","");');
        response.write('   var passvalue = document.getElementById("pass").value;');
//        response.write('   alert( passvalue );' );
        response.write('   var cmdvalue = document.getElementById("cmd").value;');
        response.write('   var argsvalue = document.getElementById("args").value;');
        response.write('   var checktarget = passvalue + "||" + cmdvalue + "||" + argsvalue;');
        response.write('   var checkvalue = md5(checktarget);');
        response.write('   check.value = checkvalue;');
        response.write('   document.forms["myform"].submit();');
        response.write('}');
        response.write('</script>');
        response.write('</head>');
        response.write('<body>');
        response.write('<form name="myform" action="/">');
        response.write('check: <input type="hidden" id="check" name="check" value=""></input>');
        response.write('cmd: <input type="text" id="cmd" name="cmd" value="' + cmd + '" onKeydown="Javascript: if (event.keyCode==13) go();"></input>');
        response.write('args: <input type="text" id="args" name="args" value="' + args + '" onKeydown="Javascript: if (event.keyCode==13) go();"></input>');
        response.write('</form>');
        response.write('pass: <input type="password" id="pass" name="pass"  onKeydown="Javascript: if (event.keyCode==13) go();"></input>');
        response.write('<input type="button" value="Submit" onclick="go()" /><br />\n');
    response.write('path: [' + url.parse( request.url ).pathname + ']<br />\n');
    response.write('hello world<br />\n');
    response.write('color: ' + queryData.color + '<br />\n' );
    response.write('cmd: ' + cmd + '<br />\n' );

    if( typeof cmd != 'undefined' ) {
        if( check != ourcheck ) {
            response.write('password invalid');
            response.end();
        } else {
            args = args.split(' ');
            response.write('args: ' + args + '<br />\n' );
            var cmdobj = spawn( cmd, args );
            cmdobj.on('exit', function(code) {
                response.write('done, code: ' + code );
                response.end();
            });
            cmdobj.on('error', function(code) {
                response.write('error, code: ' + code );
                response.end();
            });
            cmdobj.stdout.on('data', function(data) {
                response.write( String(data).split('\n').join('<br/>\n' ).replace(/ /g, '&nbsp;' ) );
            });
        }
    } else {
        response.write('</body><html>');
        response.end();
    }
//    } else {
//        response.writeHead(200, {'Content-type': 'text/html' });
//        response.write('<html><head></head><body><form action="run">');
//        response.write('cmd: <input type="text" name="cmd"></input>');
//        response.write('args: <input type="text" name="args"></input>');
//        response.write('<input type="submit" />');
//        response.write('</form></body><html>');
//        response.end();
//    }
    } else if( path == '/md5.min.js' ) {
        serveStaticJs( 'md5.min.js', response);
    } else {
        response.write('page ' + path + ' not known');
        response.end();
    }
}).listen(8888);


