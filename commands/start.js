/**
 * Application server
 */

'use strict'
var fs = require('fs'),
	express = require('express'),
	favicon = require('serve-favicon'),
	locals = require('../lib/locals'),
	helpers = require('../lib/helpers'),
	livereload = require('../lib/livereload'),
	exec = require('child_process').exec;

module.exports = function(options, home) {
	options = options || { pretty: false };
	home = home || process.cwd();

	var config = require(home + '/config.json'),
		browserifyArgs = config.browserify || [],
		stylusArgs = config.stylus || [];

	locals.init('app', home, config);

	// APP SERVER
	if (config.appPort) {
		var app = express();

		app.set('views', home + '/' + config.viewsPath);
		app.set('view engine', 'pug');
		app.set('view cache', false);

		// statics
		let faviconFile = fs.existsSync(home + '/favicon.ico') ?
			(home + '/favicon.ico') : (__dirname + '/../favicon.ico');

		app.use(favicon(faviconFile));
		app.use('/assets', express.static(home + '/' + config.sourcePath));
		app.use('/compiled', express.static(home + '/' + config.destPath));

		// populate helpers
		Object.keys(locals).forEach(k => app.locals[k] = locals[k]);

		// allows absolute path in 'extends' for jade
		app.locals.basedir = app.get('views');

		// indented html output
		if (options.pretty) app.locals.pretty = '\t';

		// serve api
		app.use(/^\/api\/(.*)$/, (req, res) => {
			var src = home + '/api/' + req.params[0];
			fs.exists(src + '.js', exists => {
				if (!exists) return res.status(404).end('API not found: ' + src);
				try {
					let api = require(src);
					delete require.cache[require.resolve(src)];
					if (typeof api === 'function') return api(req, res);
					else return res.json(api);
				}
				catch (e) {
					res.status(500).end(e.toString());
				}
			});
		});

		// serve views
		app.get(/^\/(.*)$/, (req, res) => {
			var reqPath = req.params[0];
			if (reqPath === '') reqPath = 'index';

			helpers.lookupData(reqPath, config.dataPath, data => {
				if (config.livereloadPort)
					data.__livereload ='<script src="//' +
						req.hostname + ':' + config.livereloadPort + '/livereload.js"></script>';
				else data.__livereload = false;
				data.req = req;
				try {
					res.render(reqPath, data, (err, output) => {
						if (err) res.status(500).end(err.toString());
						else res.end(output);
					});
				}
				catch (e) {
					res.status(404).end('Not found');
				}
			});
		});

		app.listen(config.appPort);
	}

	// LIVERELOAD SERVER

	if (config.livereloadPort) livereload(config.livereloadPort, home + '/' + config.destPath);

	// WATCH SOURCES

	[{
		files: config.js,
		command: __dirname + '/../node_modules/.bin/watchify ' + config.sourcePath + '/js/{input} ' +
			helpers.browserifyArgs.join(' ') +
			browserifyArgs.join(' ') +
			' -d -o ' + config.destPath + '/{output}.js'
	}, {
		files: config.styles,
		command: __dirname + '/../node_modules/.bin/stylus ' + config.sourcePath + '/styles/{input} ' +
			helpers.stylusArgs.join(' ') +
			stylusArgs.join(' ') +
			' -m --sourcemap-root ' + config.sourcePath + ' -w -o ' + config.destPath + '/{output}.css'
	}].forEach(watch => {
		var command = watch.command;
		watch.files.forEach(file => {
			var watcher = exec(command
				.replace('{input}', file)
				.replace('{output}', file.split('.').slice(0, -1)));

			watcher.stdout.pipe(process.stdout);
			watcher.stderr.pipe(process.stderr);
		});
	});
};