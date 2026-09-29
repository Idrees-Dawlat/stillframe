(function () {
	'use strict';

	var api = window.StillframeCapture || {};
	window.StillframeCapture = api;

	var config = api.config || {};
	var loading = null;

	function text(key) {
		var value = config.i18n && config.i18n[key] ? String(config.i18n[key]) : '';
		return value
			.replace(/&quot;/g, '"')
			.replace(/&#039;/g, "'")
			.replace(/&lt;/g, '<')
			.replace(/&gt;/g, '>')
			.replace(/&amp;/g, '&');
	}

	function sameOrigin(url) {
		try {
			return new URL(url, window.location.href).origin === window.location.origin;
		} catch (error) {
			return false;
		}
	}

	function assetUrl(path) {
		var base = String(config.pluginUrl || '');
		if (base.slice(-1) !== '/') {
			base += '/';
		}
		var parsed = new URL(base + path, window.location.href);
		if (parsed.origin !== window.location.origin) {
			throw new Error('origin');
		}
		if (config.version) {
			parsed.searchParams.set('ver', String(config.version));
		}
		return parsed.toString();
	}

	function loadStylesheet(url, id) {
		return new Promise(function (resolve, reject) {
			var existing = document.getElementById(id);
			if (existing) {
				resolve();
				return;
			}
			var link = document.createElement('link');
			link.rel = 'stylesheet';
			link.id = id;
			link.href = url;
			link.onload = function () {
				resolve();
			};
			link.onerror = function () {
				if (link.parentNode) {
					link.parentNode.removeChild(link);
				}
				reject(new Error(id));
			};
			document.head.appendChild(link);
		});
	}

	function loadScript(url, id) {
		return new Promise(function (resolve, reject) {
			var existing = document.getElementById(id);
			if (existing) {
				resolve();
				return;
			}
			var script = document.createElement('script');
			script.id = id;
			script.src = url;
			script.async = false;
			script.onload = function () {
				resolve();
			};
			script.onerror = function () {
				if (script.parentNode) {
					script.parentNode.removeChild(script);
				}
				reject(new Error(id));
			};
			document.head.appendChild(script);
		});
	}

	function ensurePanelAssets() {
		if (loading) {
			return loading;
		}
		loading = Promise.resolve().then(function () {
			return Promise.all([
				loadStylesheet(assetUrl('assets/css/stillframe-capture-panel.css'), 'stillframe-capture-panel-css'),
				loadScript(assetUrl('assets/js/stillframe-annotation-editor.js'), 'stillframe-annotation-editor-js'),
				loadScript(assetUrl('assets/js/vendor/modern-screenshot.js'), 'stillframe-modern-screenshot-js')
			]);
		}).then(function () {
			return loadScript(assetUrl('assets/js/stillframe-capture-panel.js'), 'stillframe-capture-panel-js');
		}).catch(function (error) {
			loading = null;
			throw error;
		});
		return loading;
	}

	function menuLink() {
		var item = document.getElementById('wp-admin-bar-stillframe-capture');
		if (!item) {
			return null;
		}
		return item.querySelector('a');
	}

	function launch(source, toggleIfOpen) {
		if (api.isSnipping && api.isSnipping()) {
			api.cancelSnip();
			return;
		}
		if (toggleIfOpen && api.isOpen && api.isOpen()) {
			api.closePanel();
			return;
		}
		bootSnip();
		ensurePanelAssets().then(function () {
			if (!api.startSnip) {
				dropBoot();
				window.alert(text('assetsFailed') || 'Stillframe could not load the capture tools. The page was not changed.');
				return;
			}
			api.startSnip(source);
		}).catch(function () {
			dropBoot();
			window.alert(text('assetsFailed') || 'Stillframe could not load the capture tools. The page was not changed.');
		});
	}

	function svgIcon(paths) {
		var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('viewBox', '0 0 24 24');
		svg.setAttribute('width', '20');
		svg.setAttribute('height', '20');
		svg.setAttribute('aria-hidden', 'true');
		paths.forEach(function (d) {
			var path = document.createElementNS('http://www.w3.org/2000/svg', d.tag || 'path');
			Object.keys(d).forEach(function (key) {
				if (key === 'tag') {
					return;
				}
				path.setAttribute(key, d[key]);
			});
			svg.appendChild(path);
		});
		return svg;
	}

	function bootButton(pressed) {
		var button = document.createElement('button');
		button.type = 'button';
		button.tabIndex = -1;
		if (pressed) {
			button.setAttribute('aria-pressed', 'true');
		}
		return button;
	}

	function bootSnip() {
		if (document.getElementById('stillframe-snip-boot') || document.querySelector('.stillframe-snip')) {
			return;
		}
		var root = document.createElement('div');
		root.id = 'stillframe-snip-boot';
		root.className = 'stillframe-snip stillframe-snip--boot';
		root.setAttribute('data-mode', 'rect');
		root.setAttribute('aria-hidden', 'true');
		if (document.getElementById('wpadminbar')) {
			root.classList.add('has-admin-bar');
		}
		var shade = document.createElement('div');
		shade.className = 'stillframe-snip__shade';
		var bar = document.createElement('div');
		bar.className = 'stillframe-snip__bar';
		var rect = bootButton(true);
		rect.appendChild(svgIcon([{ tag: 'rect', x: '4', y: '6', width: '16', height: '12', rx: '2', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8' }]));
		var free = bootButton();
		free.appendChild(svgIcon([{ d: 'M4 17c2.2-7 3.2-1.5 5.4-6.2 1.6-3.4 2.4 4.8 4.6 1.6 1.8-2.6 2.6-5.4 6-3.2', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round' }]));
		var win = bootButton();
		win.appendChild(svgIcon([
			{ tag: 'rect', x: '3', y: '5', width: '12', height: '9', rx: '1.5', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8' },
			{ tag: 'rect', x: '8', y: '10', width: '12', height: '9', rx: '1.5', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8' }
		]));
		var full = bootButton();
		full.appendChild(svgIcon([{ d: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round' }]));
		var sep = document.createElement('span');
		sep.className = 'stillframe-snip__sep';
		var close = bootButton();
		close.appendChild(svgIcon([{ d: 'M6 6l12 12M18 6L6 18', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round' }]));
		bar.appendChild(rect);
		bar.appendChild(free);
		bar.appendChild(win);
		bar.appendChild(full);
		bar.appendChild(sep);
		bar.appendChild(close);
		root.appendChild(shade);
		root.appendChild(bar);
		document.body.appendChild(root);
	}

	function dropBoot() {
		var boot = document.getElementById('stillframe-snip-boot');
		if (boot && boot.parentNode) {
			boot.parentNode.removeChild(boot);
		}
	}

	function onMenuClick(event) {
		event.preventDefault();
		launch(event.currentTarget, true);
	}

	function bind() {
		var link = menuLink();
		if (link && link.getAttribute('data-stillframe-bound') !== '1') {
			link.setAttribute('data-stillframe-bound', '1');
			link.addEventListener('click', onMenuClick);
		}
		var tools = document.getElementById('stillframe-tools-capture');
		if (tools && tools.getAttribute('data-stillframe-bound') !== '1') {
			tools.setAttribute('data-stillframe-bound', '1');
			tools.addEventListener('click', function (event) {
				event.preventDefault();
				launch(tools, false);
			});
		}
		window.setTimeout(function () {
			ensurePanelAssets().catch(function () {
				return null;
			});
		}, 0);
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', bind);
	} else {
		bind();
	}
})();
