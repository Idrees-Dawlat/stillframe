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
		ensurePanelAssets().then(function () {
			if (!api.startSnip) {
				window.alert(text('assetsFailed') || 'Stillframe could not load the capture tools. The page was not changed.');
				return;
			}
			api.startSnip(source);
		}).catch(function () {
			window.alert(text('assetsFailed') || 'Stillframe could not load the capture tools. The page was not changed.');
		});
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
