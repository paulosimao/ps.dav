/**
 * Created by paulosimao on 06/03/16.
 */

var MongoClient = require('mongodb').MongoClient;
var Binary      = require('mongodb').Binary;
var mime        = require('mime-types')
var fs          = require('fs');

var config      = require('./config.json');

module.exports = {
	init: function (cb) {
		var self = this;
		MongoClient.connect(config.mongo.url, function (err, db) {
			if (err) {
				console.error(err);
			}
			self.db = db;
			cb();
		});
	},
	auth: function (authinfo, cb) {
		var self = module.exports;
		if (!authinfo || authinfo.length != 2) {
			return cb(null, false);
		}
		self.db.collection('user').find({
			login: authinfo[0],
			password: authinfo[1],
			enabled: true
		}).toArray(function (err, data) {
			if (err) {
				return cb(err);
			}

			if (data && data.length > 0) {
				return cb(null, true);
			}

			return cb(null, false);
		});
	},
	PROPFIND: function (dav, cb) {
		var self = module.exports;
		var ret  = [];
		dav.loadbody(function (dav) {
			self.db.collection('fs').find({href: dav.url}).toArray(function (err, data) {
				if (data && data[0]) {
					data[0]._id     = data[0]._id.toHexString();
					data[0].getetag = data[0]._id;
					delete data[0].content;
					ret.push(data[0]);
				}
				self.db.collection('fs').find({parent: dav.url}).toArray(function (err, data) {
					for (d of data) {
						d._id     = d._id.toHexString();
						d.getetag = d._id;
						delete d.content;
						ret.push(d);
					}
					cb(err, ret);
				});

			});
		});
	},
	GET: function (dav, cb) {
		var self = module.exports;
		var ret  = [];
		self.db.collection('fs').find({href: dav.url}).toArray(function (err, data) {
			if (data && data[0]) {
				fname = data[0]._id.toString();
				self.loadFile(dav, fname, cb);
			}
		});
	},
	PUT: function (dav, cb) {
		var self = module.exports;
		var ret  = [];
		var self = module.exports;
		var ret  = [];
		var lof  = dav.url.lastIndexOf('/');
		var url2 = dav.url.substring(0, lof);
		var lof2 = url2.lastIndexOf('/');
		var url3 = url2.substring(0, lof2);
		if (url2 === '') {
			url2 = '/';
		}
		if (url3 === '') {
			url3 = '/';
		}

		var o2s = {
			href: dav.url,
			parent: url2,
			propstat: {
				prop: {
					getcontentlength: 0
				},
				status: "HTTP/1.1 200 OK"
			}
		}
		if (self.isText(dav.url)) {
			o2s.istext = true;
		} else {
			o2s.istext = false;
		}

		self.db.collection('fs').find({href: dav.url}).toArray(function (err, data) {
			if (err) {
				return cb(err, null);
			}
			if (data == null || data.length < 1) {
				self.db.collection('fs').insertOne(o2s, (err, data)=> {
					if (err) {
						return cb(err, null);
					}
					var fname = data.insertedId.toString();
					self.saveFile(dav, fname, (err, fd)=> {
						o2s.propstat.prop.getcontentlength = fd.size;
						self.db.collection('fs').updateOne({_id: data.insertedId}, o2s, cb);
					});
				});
			} else {
				var fname = data[0]._id.toString();
				self.saveFile(dav, fname, (err, fd)=> {
					data[0].propstat.prop.getcontentlength = fd.size;
					self.db.collection('fs').updateOne({_id: data.insertedId}, data[0], cb);
				});
			}
		});//, o2s, {upsert: true}, cb);
	},
	HEAD: function (dav, cb) {
		var self = module.exports;
		var ret  = [];
		self.db.collection('fs').find({href: dav.url}).toArray(function (err, data) {
			if (data && data[0]) {
				cb(err, data[0].content);
			} else {
				cb(err, null);
			}
		});
	},
	DELETE: function (dav, cb) {
		var self = module.exports;
		var ret  = [];
		self.db.collection('fs').findOneAndDelete({href: dav.url}, (err, data)=> {
			var fname = data.value._id.toString();
			if (data.value.propstat.prop.resourcetype == null || data.value.propstat.prop.resourcetype != 'collection') {
				self.deleteFile(dav, fname, cb);
			}
		});
	},
	POST: function (dav, cb) {
		var self = module.exports;
		var ret  = [];
		var lof  = dav.url.lastIndexOf('/');
		var url2 = dav.url.substring(0, lof);
		var lof2 = url2.lastIndexOf('/');
		var url3 = url2.substring(0, lof2);
		if (url3 === '') {
			url3 = '/';
		}

		var o2s = {
			href: dav.url,
			parent: url2,
			propstat: {
				prop: {
					//getcontentlength: 0;
				},
				status: "HTTP/1.1 200 OK"
			}
		}
		if (self.isText(dav.url)) {
			o2s.istext = true;
		} else {
			o2s.istext = false;
		}

		self.db.collection('fs').insertOne(o2s, (err, data) => {
			if (err) {
				return cb(err, null);
			}
			var fname = data.insertedId.toString();
			self.saveFile(dav, fname, (err, fd)=> {
				if (err) {
					return cb(err, null);
				}
				o2s.propstat.prop.getcontentlength = fd.size;
				self.db.collection('fs').updateOne({_id: data.insertedId}, o2s, (err, data)=> {
					if (err) {
						return cb(err, null);
					}
					return cb(null, 'ok');
				});
			});

		});


	},
	MOVE: function (dav, cb) {
		var self = module.exports;
		var ret  = [];
		self.db.collection('fs').updateOne({href: dav.url}, {
			$set: {
				href: dav.movedestshort,
				parent: dav.parent
			}
		}, cb);
	},
	COPY: function (dav, cb) {
		var self = module.exports;
		var ret  = [];
		self.db.collection('fs').find({href: dav.url}).toArray(function (err, data) {

			if (err) {
				return cb(err, null);
			}

			var newentry = data[0];
			delete newentry._id;
			newentry.href   = dav.movedestshort;
			newentry.parent = dav.parent;
			self.db.collection('fs').insertOne(newentry, cb);
		});
	},
	MKCOL: function (dav, cb) {
		var self = module.exports;
		var ret  = [];
		var lof  = dav.url.lastIndexOf('/');
		var url2 = dav.url.substring(0, lof);
		var lof2 = url2.lastIndexOf('/');
		var url3 = url2.substring(0, lof2);
		if (url3 === '') {
			url3 = '/';
		}
		if (url2 === '') {
			url2 = '/'
		}

		self.db.collection('fs').insertOne({
			href: dav.url, parent: url2, propstat: {
				prop: {
					resourcetype: {
						collection: ""
					}
				},
				status: "HTTP/1.1 200 OK"
			}
		}, function (err, data) {
			cb(err, data);
		});
	},
	/*
	 * Utilities
	 * */
	isText: function (m) {
		var mtype = mime.lookup(m);
		return false;
	},
	saveFile: function (dav, fname, cb) {
		var fname2  = dav.config.davroot + '/' + fname;
		var wstream = fs.createWriteStream(fname2);
		dav.req.on('end', function () {
			fs.stat(fname2, (err, st)=> {
				if (err) {
					return cb(err, null);
				}
				return cb(null, st);
			});
		});
		dav.req.pipe(wstream);

	},
	loadFile: function (dav, fname, cb) {
		var fname2  = dav.config.davroot + '/' + fname;
		var rstream = fs.createReadStream(fname2);
		rstream.on('end', ()=> {
			cb(null, 'ok');
		});
		rstream.pipe(dav.res);
	},
	deleteFile(dav, fname, cb){
		var fname2 = dav.config.davroot + '/' + fname;
		fs.unlink(fname2, cb);
	}
}