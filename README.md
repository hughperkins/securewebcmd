# securewebcmd
Execute commands on a linux server through a webpage. Secured using md5 hashing.

# How to use

```bash
npm install securewebcmd
nodejs node_modules/securewebcmd
```
... then type in the password twice

* Connect to the server from a webbrowser, at point 8888, ie [http://localhost:8888](http://localhost:8888)
* Type in a command, some arguments, fill in the password, and press 'enter'
* the command should run, on the server, and the results be returned

# How is it secured, since it's using http?

* the password isn't sent to the server, it's used to generate an md5 hash of the command and its arguments
* the hash is sent to the server
* the server recreates the hash, based on the password you typed when you started the server, the command, and the arguments
* if the hash doesnt match the one your client sent, the request is ignored, otherwise it runs, and the results are piped back to the internet browser

# Is my data encrypted during transport, in either direction?

No. Not encrypted, simply, one needs to know the password, if one wants the request sent to the server to be executed on the server.  The request and the results themselves are sent in clear.

