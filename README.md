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
npm install -g securewebcmd
securewebcmd
```
... then type in a password of your choice twice

* Connect to the server from a webbrowser, at port 8888, ie [localhost://http:8888](http://localhost:8888)
* Type in the password, same as the one you entered at the server, and 'Login'
* Type in a working directory, a command, and click 'Launch'
* the command should run, on the server, and the results appear in real-time
* you can kill the job by clicking 'kill' button next to the running job, in the 'History' section
* you can view the results for any job, current or past, by clicking the 'Results' button, next to the job, in the 'History' section

# What if I run a task while another is already running?

* it will be queued
* it will start once the running task finishes, or you kill the currently running task

# How is it secured?

## In https mode:
* everything is encrypted, by virtue of using https
* all commands, including viewing, and running things, are password-protected (but the password is never sent to the server, just used to create a salted hash)

## In http mode:
* all commands, including viewing, and running things, are password-protected, using password hashes
* so, it would be challenging for someone to run arbitrary commands against the server
* however, in http mode, if someone can sniff the traffic they can:
  * do replay attacks, ie run the same commands over and over again
    * this includes sending requests for viewing arbitrary results
  * read all the traffic (except the password, which is never directly transmitted, just used to send a salted hash)

# Is my data encrypted during transport, in either direction?

Yes, if you use https.  No, if you don't.

# Is it secure from a man-in-middle attack?

Yes, if you use https, and have some way of validating the certificate from the browser side. Otherwise, not.

# Can I use https?

Yes.  From inside the `securewebcmd` directory, do:
```bash
openssl genrsa -out key.pem   (note: just hit return several times, to accept the defaults)
openssl req -new -key key.pem -out csr.pem
openssl x509 -req -days 9999 -in csr.pem -signkey key.pem -out cert.pem
rm csr.pem
```
... then restart the securewebcmd nodejs server
... and connect to [https://localhost:8888](https://localhost:8888), instead of [http://localhost:8888](http://localhost:8888)
* since it is using a self-signed certificate, you will need to accept the warnings that appear

# If I use https, can people do a man-in-the middle attack etc?

If you have some way of ensuring that the certificate you see from the browser is the one that the server is using, then tricky.  Otherwise, yes.

# Why don't I just not use https, and stick with the md5 hash?

Well, in http, everything you transmit is transmitted in clear, and so you're susceptible to replay attacks and so on.  In https, traffic is not easily readable, providing protection against passive attacks.

# What libraries does it use?

* nodejs (more a platform than a library I suppose?)
* express
* angular
* bit of jquery
* twitter bootstrap

Angular is really awesome :-)  It's like Jinja2 for the front-end, works really well with ajax :-)

