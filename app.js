var http      = require('http');
var DAVServer = require('./davserver');
var handler   = require('./mongohandler');
var davserver = new DAVServer(handler);



handler.init(function () {
	var server = http.createServer(function (req, res) {
		davserver.handleRequest(req, res);
	});
	server.listen(8000);
})


