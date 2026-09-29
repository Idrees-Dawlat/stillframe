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
		svg.setAttribute('width', '18');
		svg.setAttribute('height', '18');
		svg.setAttribute('fill', 'none');
		svg.setAttribute('stroke', 'currentColor');
		svg.setAttribute('stroke-width', '1.8');
		svg.setAttribute('stroke-linecap', 'round');
		svg.setAttribute('stroke-linejoin', 'round');
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

	function bootButton(paths, label, pressed) {
		var button = document.createElement('button');
		button.type = 'button';
		button.tabIndex = -1;
		if (pressed) {
			button.setAttribute('aria-pressed', 'true');
		}
		button.appendChild(svgIcon(paths));
		if (label) {
			var span = document.createElement('span');
			span.className = 'stillframe-btn__label';
			span.textContent = label;
			button.appendChild(span);
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
		var area = bootButton([{ tag: 'rect', x: '4', y: '5', width: '16', height: '14', rx: '2.5', 'stroke-dasharray': '3.2 2.6' }], text('snipRect') || 'Area', true);
		var win = bootButton([
			{ tag: 'rect', x: '3.5', y: '5', width: '17', height: '14', rx: '2.5' },
			{ d: 'M3.5 9.5h17' }
		], text('snipWindow') || 'Window');
		var full = bootButton([{ d: 'M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15' }], text('snipFull') || 'Full screen');
		var sep = document.createElement('span');
		sep.className = 'stillframe-snip__sep';
		var close = bootButton([{ d: 'M6 6l12 12M18 6L6 18' }]);
		close.className = 'stillframe-snip__close';
		bar.appendChild(area);
		bar.appendChild(win);
		bar.appendChild(full);
		bar.appendChild(sep);
		bar.appendChild(close);
		root.appendChild(shade);
		var hint = document.createElement('div');
		hint.className = 'stillframe-snip__hint';
		hint.textContent = text('snipHint') || 'Drag to select an area';
		root.appendChild(bar);
		root.appendChild(hint);
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
