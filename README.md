# securewebcmd
Execute commands on a linux server through a webpage. Secured using md5 hashing.

Security:
* works with http or https
* password protected
* password not transmitted
* you can use https, which provides protection against replay attacks, and encrypts traffic, in both directions

Functions:
* see history of commands run previously
* watch results of command in real-time, don't have to wait for command to finish running first
* view results of any command, currently running, or historic
* results are persistent, even after server restart
* uses nodejs, simple to install and run
  * doesn't need apache etc ...
* can kill jobs after starting them

![screenshot-server](screenshots/securewebcmd-server.png)

![screenshot0](screenshots/securewebcmd0.png)

![screenshot1](screenshots/securewebcmd1.png)

![screenshot2](screenshots/securewebcmd2.png)

# How to use

```bash
npm install securewebcmd
npm start securewebcmd
```
... then type in the password twice

* Connect to the server from a webbrowser, at port 8888, ie [localhost://http:8888](http://localhost:8888)
* Type in the password, same as the one you entered at the server
* Type in a command, a directoryt to run in, and click 'run'
* the command should run, on the server, and the results appear in real-time
* you can kill the job by clicking 'kill' button next to the running job, at the top of the screen
* you can view the results for any job, current or past, by clicking the 'results' button, next to the job line, at the top of the window

# What if I run a task while another is already running?

* it will be queued
* it will start once the running task finishes, or you click 'kill' to kill the running task

# How is it secured, since it's using http?

* in http mode, the password isn't sent to the server, it's used to generate an md5 hash of the command and its arguments
* the hash is sent to the server
* the server recreates the hash, based on the password you typed when you started the server, the command, and the arguments
* if the hash doesnt match the one your client sent, the request is ignored, otherwise it runs, and the results are piped back to the internet browser

# Is my data encrypted during transport, in either direction?

No. Not encrypted, simply, one needs to know the password, if one wants the request sent to the server to be executed on the server.  The request and the results themselves are sent in clear.

If you use https, then the traffic is encrypted :-)

# Is it secure from a man-in-middle attack?

No.  If someone can change the traffic en-route, they can change the javascript sent to the browser.  (If you use https, you're more secure on this front, as long as you have some way of validating that the certificate you are receiving on the browser is the one the server is using).

# Can I use https?

Why, yes, you can :-)  Do the following, from inside the `securewebcmd` directory:
```bash
openssl genrsa -out key.pem
openssl req -new -key key.pem -out csr.pem
openssl x509 -req -days 9999 -in csr.pem -signkey key.pem -out cert.pem
rm csr.pem
```
... then restart the securewebcmd nodejs server
... and connect to [https://localhost:8888](https://localhost:8888), instead of [http://localhost:8888](http://localhost:8888)
* since it is using a self-signed certificate, you will need to accept the warnings that appear

# If I use https, can people do a man-in-the middle attack etc now?

Hmmm, yeah, kind of, if you have no way of checking the self-signed certificate in the browser is the same one you generated, which in general one just clicks 'accept'.

# So why don't I just not use https, and stick with the md5 hash?

Well, in http, everything you transmit is transmitted in clear, and so you're susceptible to replay attacks and so on.  In https, it's not readable, providing protection against passive attacks.

