/**
 * Created by paulosimao on 06/03/16.
 */
var events = require('events');
var xml2js = require('xml2js');

var xmlparser  = new xml2js.Parser();
var xmlbuilder = new xml2js.Builder();

var config = require('./config.json');


function DAVServer(handler) {
	this.emitter  = new events();
	this.davlevel = '1';
	this.davallow = 'OPTIONS, GET, HEAD, POST, PUT, DELETE, TRACE, COPY, MOVE, MKCOL, PROPFIND, PROPPATCH, LOCK, UNLOCK, ORDERPATCH';

	this.on('PROPFIND', handler.PROPFIND);
	this.on('GET', handler.GET);
	this.on('POST', handler.POST);
	this.on('PUT', handler.PUT);
	this.on('MOVE', handler.MOVE);
	this.on('MKCOL', handler.MKCOL);
	this.on('HEAD', handler.HEAD);
	this.on('DELETE', handler.DELETE);
	this.on('COPY', handler.COPY);

	this.handler = handler;
}

DAVServer.prototype.on = function (type, l) {
	this.emitter.on(type, l);
}


DAVServer.prototype.handleRequest = function (req, res) {

	var self = this;

	req.authorization = req.headers.authorization ? new Buffer(req.headers.authorization.replace('Basic ', ''), 'base64').toString('utf-8').split(':') : null;

	this.handler.auth(req.authorization, function (err, isauth) {

		if (err) {
			res.writeHead(400, err.toString());
			return res.end();
		}


		if (!isauth) {
			res.writeHead(401, 'Unauthorized', {
				'WWW-Authenticate': 'Basic realm="DAVFS - ps.dav"'
			});
			return res.end();
		}


		req.dav          = {};
		req.dav.protocol = 'http';
		req.dav.host     = req.headers.host;
		req.dav.url      = req.url;
		req.dav.config   = config;

		if (req.dav.url.endsWith('\/')) {
			req.dav.url = req.dav.url.substring(0, req.dav.url.length - 1);
		}
		if (req.dav.url === '') {
			req.dav.url = '/';
		}

		req.dav.baseref       = `${req.dav.protocol}://${req.dav.host}${req.dav.url}`;
		req.dav.body          = '';
		req.dav.binary        = new Buffer('');
		req.dav.movedest      = req.headers.destination;
		req.dav.movedestshort = req.headers.destination ? req.headers.destination.replace(req.dav.protocol + '://' + req.dav.host, '') : null;
		req.dav.moveoverwrite = req.headers.overwrite && req.headers.overwrite === 'T';
		req.dav.urlregex      = req.dav.url.replace(/\//g, '\\\/');
		var lof               = req.dav.url.lastIndexOf('/');
		req.dav.fname         = req.dav.url.substring(lof, req.dav.url.length);
		req.dav.parent        = req.dav.movedestshort && req.dav.fname ? req.dav.movedestshort.replace(req.dav.fname, '') : null;
		req.dav.req           = req;
		req.dav.res           = res;

		if (req.dav.parent === '') {
			req.dav.parent = '/';
		}


		req.dav.loadbody = function (cb) {
			req.on('data', (chunck)=> {
				req.dav.body   = req.dav.body + new Buffer(chunck).toString();
				req.dav.binary = Buffer.concat([req.dav.binary, chunck]);
			});


			req.on('end', function () {
				//console.log('BodyData:' + req.dav.body);
				xmlparser.parseString(req.dav.body, function (err, data) {
					if (err) {
						console.error(err);
					}
					if (data) {
						req.dav.bodyobj = data;
					}
					cb(req.dav);

				})
			});
		}

		if (self[req.method]) {
			self[req.method](req, res);
		} else {
			var msg = `REQ METHOD:${req.method} no implemented`;
			console.error(msg);
			res.writeHead(501, msg);
			res.end();
		}

	});
}


DAVServer.prototype.OPTIONS   = function (req, res) {
	console.log('OPTIONS');
	res.setHeader('DAV', '1');
	res.setHeader('Allow', 'OPTIONS, GET, HEAD, POST, PUT, DELETE, TRACE, COPY, MOVE, MKCOL, PROPFIND, PROPPATCH, LOCK, UNLOCK, ORDERPATCH');
	res.end();
}
DAVServer.prototype.GET       = function (req, res) {
	console.log('GET');
	this.emitter.emit('GET', req.dav, function (err, data) {
		res.write(data);
		res.end();
	});
}
DAVServer.prototype.POST      = function (req, res) {
	console.log('POST');
	this.emitter.emit('POST', req.dav, function (err, data) {
		//res.write(data);
		res.end();
	});
}
DAVServer.prototype.PROPFIND  = function (req, res) {
	console.log('PROPFIND:' + req.dav.url);

	this.emitter.emit('PROPFIND', req.dav, function (err, data) {
		if (err) {
			console.error(err);
			res.writeHead(500, 'Error' + err.toString());
			return res.end();

		}

		if (data == null || data.length < 1) {
			console.log('Not found')
			res.writeHead(404, 'Not Found: ' + req.dav.url);
			return res.end();
		}

		var objres = {
			multistatus: {
				response: data
				, $     : {
					xmlns: 'DAV:'
				}
			}
		}


		var xml = xmlbuilder.buildObject(objres).trim();
		//console.log(xml);

		res.writeHead(207, 'Multi-Status', {
			'Content-type' : 'text/xml',
			'Cache-Control': 'public, max-age=0'
		});
		//res.setEncoding('binary')
		//console.log(xml);
		res.write(xml);
		res.end();
		//res.end();
	});
}
DAVServer.prototype.HEAD      = function (req, res) {
	console.log('HEAD');
	this.emitter.emit('HEAD', req.dav, function (err, data) {
		if (data) {
			res.writeHead(200, 'OK', {});
		} else {
			res.writeHead(404, 'NOT FOUND', {});
		}
		res.end();
	});
}
DAVServer.prototype.PROPMATCH = function (req, res) {
	res.append('DAV', '3');
	console.log('PROPMATCH');
	res.send();
	res.end();
}
DAVServer.prototype.MKCOL     = function (req, res) {
	console.log('MKCOL');
	this.emitter.emit('MKCOL', req.dav, function (err, data) {
		//res.write(data);
		res.end();
	});
}
DAVServer.prototype.DELETE    = function (req, res) {
	console.log('DELETE');
	this.emitter.emit('DELETE', req.dav, function (err, data) {
		//res.write(data);
		res.end();
	});
}
DAVServer.prototype.PUT       = function (req, res) {
	console.log('PUT');
	this.emitter.emit('PUT', req.dav, function (err, data) {
		if (err) {
			console.error(err);
			res.writeHead(500, 'Error' + err.toString());
			return res.end();

		}
		//res.write(data);
		res.end();
	});
}
DAVServer.prototype.COPY      = function (req, res) {
	console.log('COPY');
	this.emitter.emit('COPY', req.dav, function (err, data) {
		if (err) {
			console.error(err);
			res.writeHead(500, 'Error' + err.toString());
			return res.end();

		}
		res.end();
	});
}
DAVServer.prototype.MOVE      = function (req, res) {
	console.log('MOVE');
	this.emitter.emit('MOVE', req.dav, function (err, data) {
		if (err) {
			console.error(err);
			res.writeHead(500, 'Error' + err.toString());
			return res.end();

		}
		res.writeHead(201, 'Created', {
			Location: req.dav.movedest
		});

		res.end();
	});
}
DAVServer.prototype.LOCK      = function (req, res) {
	res.append('DAV', '3');
	console.log('LOCK');
	res.send();
	res.end();
}
DAVServer.prototype.UNLOCK    = function (req, res) {
	res.append('DAV', '3');
	console.log('UNLOCK');
	res.send();
	res.end();
}

module.exports = DAVServer;
