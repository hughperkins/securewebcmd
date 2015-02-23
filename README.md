# securewebcmd
Execute commands on a linux server through a webpage. Secured using md5 hashing.

# How to use

```bash
npm install securewebcmd
npm start securewebcmd
```
... then type in the password twice

* Connect to the server from a webbrowser, at port 8888, ie [localhost://http:8888](http://localhost:8888)
* Type in a command, some arguments, fill in the password, and press 'enter'
* the command should run, on the server, and the results be returned

# How is it secured, since it's using http?

* in http mode, the password isn't sent to the server, it's used to generate an md5 hash of the command and its arguments
* the hash is sent to the server
* the server recreates the hash, based on the password you typed when you started the server, the command, and the arguments
* if the hash doesnt match the one your client sent, the request is ignored, otherwise it runs, and the results are piped back to the internet browser

# Is my data encrypted during transport, in either direction?

No. Not encrypted, simply, one needs to know the password, if one wants the request sent to the server to be executed on the server.  The request and the results themselves are sent in clear.

# Is it secure from a man-in-middle attack?

No.  If someone can change the traffic en-route, they can change the javascript sent to the browser.

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

In https mode, the entered password will be transmitted over the ssl connection, in both directions, and re-populate the password field in the form, so you won't need to keep re-entering the password each time.  This is more or less secure, since the connection is using ssl, and easier to use.


