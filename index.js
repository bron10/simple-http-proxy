
/**
 * Module dependencies
 */
var url = require('url')
  , join = require('path').join
  , debug = require('debug')("simple-http-proxy")
  , protocols = {
      http: require('http'),
      https: require('https')
    };

module.exports = function(endpoint, opts) {
  if(!opts) opts = {};

  var parsedUrl = url.parse(endpoint);

  return function simpleHttpProxy(req, res, next) {
    // Remove the host header
    delete req.headers.host;

    // Optionally delete cookie
    if(opts.cookies === false) delete req.headers.cookie;

    // Should we keep the trailing slash?
    var trailingSlash = req.originalUrl[req.originalUrl.length-1] === "/";

    // Setup the options
    var options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      headers: req.headers,
      path: join(parsedUrl.pathname, trailingSlash ? req.url : req.url.substring(1)),
      method: req.method
    };

    // Enable forwarding headers
    if(opts.xforward) {
      // Get our forwarding info
      var hostInfo = req.headers.host.split(":")
        , resPath = req.originalUrl.replace(req.url, "");

      // We'll need to add a / if it's not on there
      if(resPath.indexOf("/") !== 0) resPath = join("/", resPath);

      // Pass along our headers
      options.headers["x-forwarded-proto"] = req.connection.encrypted ? "https" : "http";
      options.headers["x-forwarded-host"] = hostInfo[0];
      options.headers["x-forwarded-path"] = resPath;

      if (hostInfo[1]) options.headers["x-forwarded-port"] = hostInfo[1];
    }

    debug("sending proxy request", options);

    // Make the request with the correct protocol
    var request = protocols[parsedUrl.protocol.replace(":", "") || 'http'].request(options, function(response) {
      debug("got response");

      // Send down the statusCode and headers
      debug("sending head", response.statusCode, response.headers);
      res.writeHead(response.statusCode, response.headers);

      // Pipe the response
      debug("piping response");
      response.pipe(res);
    });

    // Handle any timeouts that occur
    request.setTimeout(opts.timeout || 10000, function() {
      // Clean up the socket
      // TODO is there a better way to do this? There's a 'socket hang up' error being emitted...
      request.setSocketKeepAlive(false);
      request.socket.destroy();

      // Pass down the error
      var err = new Error("Proxy to '"+endpoint+"' timed out");
      request.emit("error", err);
    });

    // Pipe the client request upstream
    req.pipe(request);

    // Pass on our errors
    request.on('error', next);
  }
}
