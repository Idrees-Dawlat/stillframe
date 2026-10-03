(function () {
	'use strict';

	var api = window.StillframeCapture || {};
	window.StillframeCapture = api;

	var config = api.config || {};
	var session = 0;
	var panel = null;
	var dialog = null;
	var frame = null;
	var editor = null;
	var objectUrl = '';
	var returnFocus = null;
	var captured = null;
	var statusNode = null;
	var customButton = null;
	var customInput = null;
	var captureButton = null;
	var windowButton = null;
	var downloadButton = null;
	var mediaButton = null;
	var undoButton = null;
	var clearButton = null;
	var penButton = null;
	var editorSection = null;
	var canvasWrap = null;
	var keyHandler = null;
	var focusHandler = null;
	var snip = null;
	var snipKeyHandler = null;
	var sceneRestore = null;
	var morePopover = null;
	var compactPanel = false;
	var resultReady = false;
	var pendingAction = '';
	var resultObserver = null;
	var snipCleanup = null;
	var toolColor = '#ef4444';
	var toolSize = 4;
	var viewShot = {
		id: 0,
		canvas: null,
		work: null,
		scale: 1,
		slow: false
	};

	// Above this many elements, or after a render slower than SLOW_RENDER_MS,
	// the page is rendered only after the selection is released. A background
	// render freezes the main thread and would make the drag stutter.
	var HEAVY_PAGE_NODES = 1500;
	var SLOW_RENDER_MS = 700;
	var IDLE_BEFORE_RENDER_MS = 1500;

	function canPrerender() {
		if (exactEnabled()) {
			return false;
		}
		if (viewShot.slow) {
			return false;
		}
		return document.getElementsByTagName('*').length <= HEAVY_PAGE_NODES;
	}

	function text(key) {
		var value = config.i18n && config.i18n[key] ? String(config.i18n[key]) : '';
		return value
			.replace(/&quot;/g, '"')
			.replace(/&#039;/g, "'")
			.replace(/&lt;/g, '<')
			.replace(/&gt;/g, '>')
			.replace(/&amp;/g, '&');
	}

	function tr(key, fallback) {
		return text(key) || fallback;
	}

	function lockScroll() {
		document.documentElement.classList.add('stillframe-locked');
		document.body.classList.add('stillframe-locked');
	}

	function unlockScroll() {
		if (!snip && !panel) {
			document.documentElement.classList.remove('stillframe-locked');
			document.body.classList.remove('stillframe-locked');
		}
	}

	function element(tag, attrs) {
		var node = document.createElement(tag);
		if (!attrs) {
			return node;
		}
		Object.keys(attrs).forEach(function (key) {
			if (key === 'text') {
				node.textContent = attrs[key];
				return;
			}
			if (key === 'className') {
				node.className = attrs[key];
				return;
			}
			node.setAttribute(key, attrs[key]);
		});
		return node;
	}

	var statusTimer = 0;

	function setStatus(message, linkHref, linkLabel, tone) {
		if (!statusNode) {
			return;
		}
		window.clearTimeout(statusTimer);
		if (tone) {
			statusNode.setAttribute('data-tone', tone);
		} else {
			statusNode.removeAttribute('data-tone');
		}
		if (tone === 'success' && message) {
			statusTimer = window.setTimeout(function () {
				if (statusNode) {
					setStatus('');
				}
			}, 9000);
		}
		while (statusNode.firstChild) {
			statusNode.removeChild(statusNode.firstChild);
		}
		if (message) {
			statusNode.appendChild(document.createTextNode(message));
		}
		if (!linkHref || !linkLabel) {
			return;
		}
		var link;
		try {
			link = new URL(linkHref, window.location.href);
		} catch (error) {
			return;
		}
		if (link.origin !== window.location.origin) {
			return;
		}
		statusNode.appendChild(document.createTextNode(' '));
		statusNode.appendChild(element('a', {
			className: 'stillframe-result__status-link',
			href: link.toString(),
			text: linkLabel,
			target: '_blank',
			rel: 'noopener noreferrer'
		}));
	}

	function isScreenMode() {
		var screen = panel ? panel.querySelector('.stillframe-width-screen') : null;
		return !!(screen && screen.getAttribute('aria-pressed') === 'true');
	}

	function revealExports() {
		if (downloadButton) {
			downloadButton.hidden = false;
			downloadButton.disabled = false;
		}
		if (mediaButton && config.canUpload) {
			mediaButton.hidden = false;
			mediaButton.disabled = false;
		}
	}

	function removeFrame() {
		if (frame && frame.parentNode) {
			frame.parentNode.removeChild(frame);
		}
		frame = null;
	}

	function focusMenu() {
		var node = returnFocus;
		if (!node || !node.isConnected) {
			var item = document.getElementById('wp-admin-bar-stillframe-capture');
			node = item ? item.querySelector('a') : null;
		}
		if (node && typeof node.focus === 'function') {
			node.focus();
		}
	}

	function isVisible(node) {
		if (!node || node.disabled || node.hidden) {
			return false;
		}
		var current = node;
		while (current && current !== dialog) {
			if (current.hidden) {
				return false;
			}
			current = current.parentElement;
		}
		var style = window.getComputedStyle(node);
		return style.display !== 'none' && style.visibility !== 'hidden';
	}

	function focusable() {
		if (!dialog) {
			return [];
		}
		var selector = 'button, input, a[href], select, textarea, [tabindex]:not([tabindex="-1"])';
		return Array.prototype.filter.call(dialog.querySelectorAll(selector), isVisible);
	}

	function slugFromPath(urlString) {
		var path = '';
		try {
			path = new URL(urlString, window.location.href).pathname || '';
		} catch (error) {
			path = window.location.pathname || '';
		}
		var slug = path.toLowerCase().replace(/[^a-z0-9-]/g, '');
		if (!slug) {
			slug = 'screen';
		}
		if (slug.length > 80) {
			slug = slug.slice(0, 80);
		}
		return slug;
	}

	function fileNameFor(urlString, width, scale) {
		return 'stillframe-' + slugFromPath(urlString) + '-' + String(width) + 'w-' + String(scale) + 'x.png';
	}

	function formatCaptured(width, scale) {
		return text('captured')
			.replace('%1$d', String(width))
			.replace('%2$d', String(scale));
	}

	function captureTargetUrl() {
		var current = new URL(window.location.href);
		var target;
		try {
			target = new URL(String(config.currentUrl || current.href), current.href);
		} catch (error) {
			target = new URL(current.href);
		}
		if (target.origin !== current.origin) {
			target = new URL(current.href);
		}
		var strip = Array.isArray(config.stripArgs) && config.stripArgs.length
			? config.stripArgs
			: ['action', '_wpnonce', 'nonce', '_wp_http_referer', 'wp_customize'];
		strip.forEach(function (key) {
			target.searchParams.delete(String(key));
		});
		target.hash = '';
		return target.toString();
	}

	function readScale() {
		return 1;
	}

	function viewSize() {
		return {
			width: Math.max(1, Math.round(document.documentElement.clientWidth || window.innerWidth || 1)),
			height: Math.max(1, Math.round(document.documentElement.clientHeight || window.innerHeight || 1))
		};
	}

	function invalidateViewShot() {
		viewShot.id += 1;
		viewShot.canvas = null;
		viewShot.work = null;
	}

	function viewScale() {
		var ratio = window.devicePixelRatio || 1;
		return Math.min(3, Math.max(2, Math.round(ratio)));
	}

	// Browsers cap canvas size (about 16k px per side, 268M px total). Step the scale down to fit.
	function safeScale(width, height, scale) {
		var next = scale;
		while (next > 1 && (width * next > 16384 || height * next > 16384 || width * next * height * next > 120000000)) {
			next -= 1;
		}
		return next;
	}

	// Exact engine: a real screenshot of this tab through the browser's own capture.
	var EXACT_KEY = 'stillframeEngine';
	var exact = { stream: null, video: null, timer: 0, failed: false };

	function exactPref() {
		try {
			return window.localStorage.getItem(EXACT_KEY) !== 'compat';
		} catch (error) {
			return true;
		}
	}

	function setExactPref(on) {
		try {
			window.localStorage.setItem(EXACT_KEY, on ? 'exact' : 'compat');
		} catch (error) {
			// Storage can be blocked; the choice then lasts for this page only.
		}
		exact.failed = false;
	}

	function exactEnabled() {
		if (exact.failed || !exactPref()) {
			return false;
		}
		return !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia && /Chrome\//.test(navigator.userAgent));
	}

	function stopExact() {
		window.clearTimeout(exact.timer);
		if (exact.stream) {
			exact.stream.getTracks().forEach(function (track) {
				track.stop();
			});
		}
		if (exact.video) {
			exact.video.srcObject = null;
			if (exact.video.parentNode) {
				exact.video.parentNode.removeChild(exact.video);
			}
		}
		exact.stream = null;
		exact.video = null;
	}

	// Keep the share open briefly so a second capture does not ask again.
	function keepExactAlive() {
		window.clearTimeout(exact.timer);
		exact.timer = window.setTimeout(stopExact, 45000);
	}

	function getExactVideo() {
		if (exact.stream && exact.video && exact.stream.active) {
			return Promise.resolve(exact.video);
		}
		stopExact();
		return navigator.mediaDevices.getDisplayMedia({
			video: { displaySurface: 'browser' },
			audio: false,
			preferCurrentTab: true,
			selfBrowserSurface: 'include',
			surfaceSwitching: 'exclude'
		}).then(function (stream) {
			var track = stream.getVideoTracks()[0];
			var settings = track && track.getSettings ? track.getSettings() : {};
			if (!track || (settings.displaySurface && settings.displaySurface !== 'browser')) {
				stream.getTracks().forEach(function (item) {
					item.stop();
				});
				throw new Error('surface');
			}
			track.addEventListener('ended', stopExact);
			var video = document.createElement('video');
			video.muted = true;
			video.playsInline = true;
			video.srcObject = stream;
			video.style.cssText = 'position:fixed;left:-99999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
			document.body.appendChild(video);
			exact.stream = stream;
			exact.video = video;
			return video.play().then(function () {
				return new Promise(function (resolve) {
					if (video.videoWidth) {
						resolve();
						return;
					}
					video.addEventListener('loadedmetadata', function () {
						resolve();
					});
				});
			}).then(function () {
				return video;
			});
		});
	}

	function nextVideoFrame(video) {
		return new Promise(function (resolve) {
			var done = false;
			function finish() {
				if (!done) {
					done = true;
					resolve();
				}
			}
			if (video.requestVideoFrameCallback) {
				video.requestVideoFrameCallback(finish);
			}
			window.setTimeout(finish, 400);
		});
	}

	// Hide Stillframe's own UI, grab one frame, and crop the selection from it.
	function grabExact(rect, hideEl) {
		return getExactVideo().then(function (video) {
			if (hideEl) {
				hideEl.style.visibility = 'hidden';
			}
			return nextFrames(2).then(function () {
				return new Promise(function (resolve) {
					window.setTimeout(resolve, 120);
				});
			}).then(function () {
				return nextVideoFrame(video);
			}).then(function () {
				var ratio = video.videoWidth / Math.max(1, window.innerWidth);
				var expected = window.innerHeight / Math.max(1, window.innerWidth);
				if (!video.videoWidth || Math.abs(video.videoHeight / video.videoWidth - expected) > 0.03) {
					throw new Error('mismatch');
				}
				var full = document.createElement('canvas');
				full.width = video.videoWidth;
				full.height = video.videoHeight;
				full.getContext('2d').drawImage(video, 0, 0);
				return canvasToBlob(cropCanvasSync(full, rect, ratio)).then(function (blob) {
					return { blob: blob, scale: Math.round(ratio * 100) / 100 };
				});
			});
		});
	}

	function startViewShot() {
		var id = ++viewShot.id;
		viewShot.canvas = null;
		var size = viewSize();
		var scale = safeScale(size.width, size.height, viewScale());
		viewShot.scale = scale;
		var startedAt = Date.now();
		viewShot.work = waitForReady(document).then(function () {
			return renderCanvas(document.documentElement, scale, {
				width: size.width,
				height: size.height,
				crop: { x: 0, y: 0, width: size.width, height: size.height }
			}, window);
		}).then(function (canvas) {
			if (id !== viewShot.id) {
				return null;
			}
			if (Date.now() - startedAt > SLOW_RENDER_MS) {
				viewShot.slow = true;
			}
			viewShot.canvas = canvas;
			return canvas;
		}).catch(function (error) {
			if (id !== viewShot.id) {
				return null;
			}
			viewShot.work = null;
			throw error;
		});
		return viewShot.work;
	}

	function readWidth() {
		if (!panel) {
			return null;
		}
		var min = Number(config.minWidth) || 320;
		var max = Number(config.maxWidth) || 2560;
		if (customButton && customButton.getAttribute('aria-pressed') === 'true') {
			var raw = customInput.value.trim();
			if (!/^\d+$/.test(raw)) {
				return null;
			}
			var customWidth = parseInt(raw, 10);
			if (customWidth < min || customWidth > max) {
				return null;
			}
			return customWidth;
		}
		var pressed = panel.querySelector('.stillframe-width-preset[aria-pressed="true"]');
		if (!pressed) {
			return null;
		}
		var width = parseInt(pressed.getAttribute('data-width'), 10);
		if (!width || width < min || width > max) {
			return null;
		}
		return width;
	}

	function syncMarkButtons() {
		var hasMarks = !!(editor && editor.hasMarks());
		if (undoButton) {
			undoButton.disabled = !hasMarks;
		}
		if (clearButton) {
			clearButton.disabled = !hasMarks;
		}
	}

	function setBusy(busy) {
		if (!dialog) {
			return;
		}
		dialog.setAttribute('aria-busy', busy ? 'true' : 'false');
		if (captureButton) {
			captureButton.disabled = busy;
		}
		if (windowButton) {
			windowButton.disabled = busy;
		}
		if (downloadButton) {
			downloadButton.disabled = busy || !editor;
		}
		if (mediaButton) {
			mediaButton.disabled = busy || !editor || !config.canUpload;
		}
		if (customButton) {
			customButton.disabled = busy;
		}
		if (customInput) {
			customInput.disabled = busy || customButton.getAttribute('aria-pressed') !== 'true';
		}
		if (panel) {
			Array.prototype.forEach.call(panel.querySelectorAll('.stillframe-width-preset, .stillframe-width-screen, .stillframe-scale-choice, .stillframe-tool'), function (button) {
				button.disabled = busy;
			});
		}
		if (!busy) {
			syncMarkButtons();
		} else {
			if (undoButton) {
				undoButton.disabled = true;
			}
			if (clearButton) {
				clearButton.disabled = true;
			}
		}
	}

	function clearWrap() {
		if (!canvasWrap) {
			return;
		}
		while (canvasWrap.firstChild) {
			canvasWrap.removeChild(canvasWrap.firstChild);
		}
	}

	function mountEditor(image) {
		if (editor) {
			editor.destroy();
			editor = null;
		}
		clearWrap();
		canvasWrap.appendChild(image);
		if (typeof api.createAnnotationEditor !== 'function') {
			setStatus(text('libraryMissing'));
			return;
		}
		editor = api.createAnnotationEditor(canvasWrap, image, {
			onChange: syncMarkButtons,
			onToolChange: function (name) {
				if (!panel) {
					return;
				}
				Array.prototype.forEach.call(panel.querySelectorAll('.stillframe-tool'), function (button) {
					button.setAttribute('aria-pressed', button.getAttribute('data-tool') === name ? 'true' : 'false');
				});
			}
		});
		editor.setTool('pen');
		editor.setColor(toolColor);
		editor.setSize(toolSize);
		if (panel) {
			Array.prototype.forEach.call(panel.querySelectorAll('.stillframe-tool'), function (button) {
				button.setAttribute('aria-pressed', button === penButton ? 'true' : 'false');
			});
		}
		syncMarkButtons();
		if (editorSection) {
			editorSection.hidden = false;
		}
		revealExports();
	}

	function loadImage(blob) {
		return new Promise(function (resolve, reject) {
			if (objectUrl) {
				URL.revokeObjectURL(objectUrl);
				objectUrl = '';
			}
			objectUrl = URL.createObjectURL(blob);
			var image = new Image();
			image.alt = text('capturedAlt');
			image.draggable = false;
			image.style.width = '100%';
			image.style.maxWidth = '100%';
			image.style.height = 'auto';
			image.onload = function () {
				resolve(image);
			};
			image.onerror = function () {
				var failed = new Error('failed');
				failed.code = 'failed';
				reject(failed);
			};
			image.src = objectUrl;
		});
	}

	function showImage(blob, width, scale, sourceUrl) {
		if (objectUrl) {
			URL.revokeObjectURL(objectUrl);
			objectUrl = '';
		}
		objectUrl = URL.createObjectURL(blob);
		captured = {
			width: width,
			scale: scale,
			url: sourceUrl
		};
		var image = new Image();
		image.alt = text('capturedAlt');
		image.draggable = false;
		image.style.width = '100%';
		image.style.maxWidth = '100%';
		image.style.height = 'auto';
		image.onload = function () {
			if (!panel) {
				return;
			}
			mountEditor(image);
			setBusy(false);
			if (!compactPanel) {
				setStatus(formatCaptured(width, scale));
			}
			if (downloadButton) {
				downloadButton.focus();
			}
		};
		image.onerror = function () {
			setBusy(false);
			setStatus(text('captureFailed'));
		};
		image.src = objectUrl;
	}

	var EXPORT_KEY = 'stillframeExportFormat';

	function exportFormat() {
		try {
			var saved = window.localStorage.getItem(EXPORT_KEY);
			if (saved === 'jpeg' || saved === 'webp') {
				return saved;
			}
		} catch (error) {
			return 'png';
		}
		return 'png';
	}

	// Convert a PNG blob to the chosen export format. PNG passes through untouched.
	function exportAs(blob, name) {
		var format = exportFormat();
		if (format === 'png') {
			return Promise.resolve({ blob: blob, name: name });
		}
		var mime = format === 'jpeg' ? 'image/jpeg' : 'image/webp';
		var extension = format === 'jpeg' ? 'jpg' : 'webp';
		return new Promise(function (resolve) {
			var url = URL.createObjectURL(blob);
			var img = new Image();
			img.onload = function () {
				try {
					var canvas = document.createElement('canvas');
					canvas.width = img.naturalWidth;
					canvas.height = img.naturalHeight;
					var ctx = canvas.getContext('2d');
					ctx.fillStyle = '#ffffff';
					ctx.fillRect(0, 0, canvas.width, canvas.height);
					ctx.drawImage(img, 0, 0);
					canvas.toBlob(function (out) {
						URL.revokeObjectURL(url);
						if (out && out.type === mime) {
							resolve({ blob: out, name: name.replace(/\.png$/, '.' + extension) });
						} else {
							resolve({ blob: blob, name: name });
						}
					}, mime, 0.9);
				} catch (error) {
					URL.revokeObjectURL(url);
					resolve({ blob: blob, name: name });
				}
			};
			img.onerror = function () {
				URL.revokeObjectURL(url);
				resolve({ blob: blob, name: name });
			};
			img.src = url;
		});
	}

	function saveBlob(blob, name) {
		exportAs(blob, name).then(function (out) {
			writeBlob(out.blob, out.name);
		});
	}

	function writeBlob(blob, name) {
		var url = URL.createObjectURL(blob);
		var link = element('a', {
			href: url,
			download: name,
			rel: 'noopener'
		});
		link.style.display = 'none';
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		window.setTimeout(function () {
			URL.revokeObjectURL(url);
		}, 4000);
	}

	function frameState(local) {
		try {
			var doc = local.contentDocument;
			var view = local.contentWindow;
			if (!doc || !view) {
				return 'blocked';
			}
			var href = String(view.location.href || '');
			if (!href || href === 'about:blank') {
				return 'blank';
			}
			if (view.location.origin !== window.location.origin) {
				return 'blocked';
			}
			if (!doc.documentElement || !doc.body) {
				return 'blank';
			}
			return 'ready';
		} catch (error) {
			return 'blocked';
		}
	}

	function canReadFrame(local) {
		return frameState(local) === 'ready';
	}

	function nextFrames(count) {
		return new Promise(function (resolve) {
			function step(left) {
				if (left <= 0) {
					resolve();
					return;
				}
				var done = false;
				var next = function () {
					if (done) {
						return;
					}
					done = true;
					step(left - 1);
				};
				window.requestAnimationFrame(next);
				window.setTimeout(next, 80);
			}
			step(count);
		});
	}

	function measureHeight(doc) {
		var body = doc.body;
		var html = doc.documentElement;
		return Math.max(
			1,
			Math.ceil(Math.max(
				body ? body.scrollHeight : 0,
				body ? body.offsetHeight : 0,
				html ? html.scrollHeight : 0,
				html ? html.offsetHeight : 0
			))
		);
	}

	function waitForReady(doc) {
		var ready = Promise.resolve();
		try {
			if (doc.fonts && doc.fonts.ready) {
				ready = doc.fonts.ready.catch(function () {
					return null;
				});
			}
		} catch (error) {
			ready = Promise.resolve();
		}
		var limit = new Promise(function (resolve) {
			window.setTimeout(resolve, 400);
		});
		return Promise.race([ready, limit]).then(function () {
			return nextFrames(1);
		});
	}

	function isBlockedError(error) {
		return !!(error && (error.name === 'SecurityError' || error.code === 'blocked'));
	}

	var CORE_TOP = {
		'menu-dashboard': 1,
		'menu-posts': 1,
		'menu-media': 1,
		'menu-pages': 1,
		'menu-comments': 1,
		'menu-appearance': 1,
		'menu-plugins': 1,
		'menu-users': 1,
		'menu-tools': 1,
		'menu-settings': 1
	};

	var CORE_FILES = {
		'index.php': 1,
		'edit.php': 1,
		'post-new.php': 1,
		'upload.php': 1,
		'media-new.php': 1,
		'edit-comments.php': 1,
		'themes.php': 1,
		'site-editor.php': 1,
		'customize.php': 1,
		'widgets.php': 1,
		'nav-menus.php': 1,
		'theme-editor.php': 1,
		'theme-install.php': 1,
		'plugins.php': 1,
		'plugin-install.php': 1,
		'plugin-editor.php': 1,
		'users.php': 1,
		'user-new.php': 1,
		'profile.php': 1,
		'tools.php': 1,
		'import.php': 1,
		'export.php': 1,
		'site-health.php': 1,
		'export-personal-data.php': 1,
		'erase-personal-data.php': 1,
		'options-general.php': 1,
		'options-writing.php': 1,
		'options-reading.php': 1,
		'options-discussion.php': 1,
		'options-media.php': 1,
		'options-permalink.php': 1,
		'options-privacy.php': 1,
		'privacy.php': 1,
		'update-core.php': 1,
		'upgrade.php': 1,
		'edit-tags.php': 1,
		'term.php': 1,
		'about.php': 1,
		'credits.php': 1,
		'freedoms.php': 1,
		'contribute.php': 1,
		'my-sites.php': 1
	};

	var CORE_BAR = {
		'wp-admin-bar-wp-logo': 1,
		'wp-admin-bar-site-name': 1,
		'wp-admin-bar-updates': 1,
		'wp-admin-bar-comments': 1,
		'wp-admin-bar-new-content': 1,
		'wp-admin-bar-edit': 1,
		'wp-admin-bar-customize': 1,
		'wp-admin-bar-site-editor': 1,
		'wp-admin-bar-my-account': 1,
		'wp-admin-bar-search': 1,
		'wp-admin-bar-menu-toggle': 1
	};

	var CORE_WIDGETS = {
		'dashboard_right_now': 1,
		'dashboard_activity': 1,
		'dashboard_quick_press': 1,
		'dashboard_primary': 1,
		'dashboard_secondary': 1,
		'dashboard_site_health': 1
	};

	var snipBusy = false;

	function defaultPrefs() {
		var scale = parseInt(config.defaultScale, 10);
		if (scale !== 1 && scale !== 2 && scale !== 3) {
			scale = 1;
		}
		return {
			adminBar: true,
			adminMenu: true,
			plugins: 'all',
			keep: [],
			scale: scale
		};
	}

	function readPrefs() {
		var prefs = defaultPrefs();
		try {
			var raw = window.localStorage.getItem('stillframeCapturePrefs');
			if (!raw) {
				return prefs;
			}
			var saved = JSON.parse(raw);
			if (!saved || typeof saved !== 'object') {
				return prefs;
			}
			if (typeof saved.adminBar === 'boolean') {
				prefs.adminBar = saved.adminBar;
			}
			if (typeof saved.adminMenu === 'boolean') {
				prefs.adminMenu = saved.adminMenu;
			}
			if (saved.plugins === 'all' || saved.plugins === 'hide' || saved.plugins === 'choose') {
				prefs.plugins = saved.plugins;
			}
			if (Array.isArray(saved.keep)) {
				prefs.keep = saved.keep.filter(function (item) {
					return typeof item === 'string' && item.length > 0 && item.length < 200;
				}).slice(0, 80);
			}
			var savedScale = parseInt(saved.scale, 10);
			if (savedScale === 1 || savedScale === 2 || savedScale === 3) {
				prefs.scale = savedScale;
			}
		} catch (error) {
			return prefs;
		}
		return prefs;
	}

	function savePrefs(prefs) {
		try {
			window.localStorage.setItem('stillframeCapturePrefs', JSON.stringify(prefs));
		} catch (error) {
			return;
		}
	}

	function leaveScene() {
		if (!sceneRestore) {
			return;
		}
		var restore = sceneRestore;
		sceneRestore = null;
		try {
			restore();
		} catch (error) {
			return;
		}
	}

	function syncScene() {
		leaveScene();
		if (!snip) {
			return;
		}
		sceneRestore = applyScene(document, readPrefs());
	}

	function documentBase(doc) {
		try {
			if (doc.defaultView && doc.defaultView.location && doc.defaultView.location.href) {
				return doc.defaultView.location.href;
			}
		} catch (error) {
			return window.location.href;
		}
		return window.location.href;
	}

	function fileFromHref(href, base) {
		try {
			var url = new URL(href, base || window.location.href);
			var parts = url.pathname.split('/');
			return {
				file: parts[parts.length - 1] || '',
				params: url.searchParams
			};
		} catch (error) {
			return null;
		}
	}

	function isCoreHref(href, base) {
		if (!href || href.charAt(0) === '#') {
			return true;
		}
		var parsed = fileFromHref(href, base);
		if (!parsed || !CORE_FILES[parsed.file]) {
			return false;
		}
		if (parsed.params.get('page')) {
			return false;
		}
		if (parsed.file === 'edit.php' || parsed.file === 'post-new.php') {
			var postType = parsed.params.get('post_type') || 'post';
			return postType === 'post' || postType === 'page';
		}
		if (parsed.file === 'edit-tags.php' || parsed.file === 'term.php') {
			var taxonomy = parsed.params.get('taxonomy') || 'category';
			return taxonomy === 'category' || taxonomy === 'post_tag';
		}
		return true;
	}

	function cleanText(value) {
		return String(value || '').replace(/\s+/g, ' ').trim();
	}

	function nodeKey(el) {
		if (el.id) {
			return el.id;
		}
		var link = el.querySelector('a');
		var href = link ? (link.getAttribute('href') || '') : '';
		return 'href:' + href.slice(0, 180);
	}

	function collectEntries(doc) {
		var entries = [];
		var seen = {};
		var base = documentBase(doc);

		function add(entry) {
			if (!entry || !entry.key || !entry.label || !entry.nodes || !entry.nodes.length) {
				return;
			}
			if (seen[entry.key]) {
				seen[entry.key].nodes = seen[entry.key].nodes.concat(entry.nodes);
				return;
			}
			seen[entry.key] = entry;
			entries.push(entry);
		}

		var menu = doc.getElementById('adminmenu');
		if (menu) {
			Array.prototype.forEach.call(menu.children, function (li) {
				if (!li.classList || !li.classList.contains('menu-top') || li.classList.contains('wp-menu-separator') || CORE_TOP[li.id]) {
					return;
				}
				var name = li.querySelector('.wp-menu-name');
				add({
					key: nodeKey(li),
					label: cleanText(name ? name.textContent : li.textContent),
					nodes: [li]
				});
			});
			Array.prototype.forEach.call(menu.children, function (li) {
				if (!li.classList || !li.classList.contains('menu-top') || !CORE_TOP[li.id]) {
					return;
				}
				var parentName = cleanText((li.querySelector('.wp-menu-name') || li).textContent);
				var sub = li.querySelector('.wp-submenu');
				if (!sub) {
					return;
				}
				Array.prototype.forEach.call(sub.children, function (item) {
					if (!item || item.tagName !== 'LI') {
						return;
					}
					var link = item.querySelector('a');
					if (!link || isCoreHref(link.getAttribute('href') || '', base)) {
						return;
					}
					add({
						key: nodeKey(item),
						label: parentName + ': ' + cleanText(link.textContent),
						nodes: [item]
					});
				});
			});
		}

		var widgets = doc.querySelectorAll('#dashboard-widgets .postbox[id]');
		Array.prototype.forEach.call(widgets, function (box) {
			if (CORE_WIDGETS[box.id]) {
				return;
			}
			var heading = box.querySelector('h2, h3');
			add({
				key: 'widget:' + box.id,
				label: cleanText(heading ? heading.textContent : box.id),
				nodes: [box]
			});
		});

		var bars = doc.querySelectorAll('#wp-admin-bar-root-default > li, #wp-admin-bar-top-secondary > li');
		Array.prototype.forEach.call(bars, function (li) {
			if (!li.id || CORE_BAR[li.id] || li.id === 'wp-admin-bar-stillframe-capture') {
				return;
			}
			var labelNode = li.querySelector('.ab-item');
			add({
				key: li.id,
				label: cleanText(labelNode ? labelNode.textContent : li.textContent),
				nodes: [li]
			});
		});

		var wpbody = doc.getElementById('wpbody');
		if (wpbody) {
			var notices = wpbody.querySelectorAll('.notice, .update-nag, div.updated, div.error');
			if (notices.length) {
				add({
					key: 'stillframe-notices',
					label: text('notices') || 'Admin notices',
					nodes: Array.prototype.slice.call(notices)
				});
			}
		}

		return entries;
	}

	function applyScene(doc, prefs) {
		var restorers = [];

		function hide(el) {
			if (!el || el.nodeType !== 1 || el.getAttribute('data-stillframe-hidden') === '1') {
				return;
			}
			var prev = el.getAttribute('style');
			el.setAttribute('data-stillframe-hidden', '1');
			el.style.setProperty('display', 'none', 'important');
			restorers.push(function () {
				el.removeAttribute('data-stillframe-hidden');
				if (prev === null) {
					el.removeAttribute('style');
				} else {
					el.setAttribute('style', prev);
				}
			});
		}

		function important(el, prop, value) {
			if (!el) {
				return;
			}
			var prev = el.style.getPropertyValue(prop);
			var priority = el.style.getPropertyPriority(prop);
			el.style.setProperty(prop, value, 'important');
			restorers.push(function () {
				if (prev) {
					el.style.setProperty(prop, prev, priority || '');
				} else {
					el.style.removeProperty(prop);
				}
			});
		}

		if (!prefs.adminBar) {
			hide(doc.getElementById('wpadminbar'));
			important(doc.documentElement, 'margin-top', '0px');
			if (prefs.adminMenu) {
				important(doc.getElementById('adminmenuwrap'), 'top', '0px');
				important(doc.getElementById('adminmenuback'), 'top', '0px');
			}
			try {
				var styleTag = doc.createElement('style');
				styleTag.id = 'stillframe-hide-admin-bar-style';
				styleTag.textContent = '#wpadminbar { display: none !important; visibility: hidden !important; height: 0 !important; max-height: 0 !important; overflow: hidden !important; } html, body { margin-top: 0px !important; padding-top: 0px !important; }';
				(doc.head || doc.documentElement).appendChild(styleTag);
				restorers.push(function () {
					if (styleTag.parentNode) {
						styleTag.parentNode.removeChild(styleTag);
					}
				});
			} catch (e) {}
			// Themes offset sticky and fixed headers for the bar; remove those offsets too.
			try {
				[doc.documentElement, doc.body].forEach(function (node) {
					if (node && node.classList && node.classList.contains('admin-bar')) {
						node.classList.remove('admin-bar');
						restorers.push(function () {
							node.classList.add('admin-bar');
						});
					}
				});
				important(doc.documentElement, '--wp-admin--admin-bar--height', '0px');
				var view = doc.defaultView || window;
				Array.prototype.forEach.call(doc.body ? doc.body.querySelectorAll('*') : [], function (node) {
					if (node.id === 'wpadminbar' || (node.closest && node.closest('#wpadminbar'))) {
						return;
					}
					var cs = view.getComputedStyle(node);
					if ((cs.position === 'fixed' || cs.position === 'sticky') && (cs.top === '32px' || cs.top === '46px')) {
						important(node, 'top', '0px');
					}
				});
			} catch (e2) {}
		}

		if (!prefs.adminMenu) {
			hide(doc.getElementById('adminmenuback'));
			hide(doc.getElementById('adminmenuwrap'));
			important(doc.getElementById('wpcontent'), 'margin-left', '0px');
			important(doc.getElementById('wpcontent'), 'margin-right', '0px');
			important(doc.getElementById('wpfooter'), 'margin-left', '0px');
			important(doc.getElementById('wpfooter'), 'margin-right', '0px');
		}

		if (prefs.plugins !== 'all') {
			var keep = {};
			if (prefs.plugins === 'choose' && prefs.keep) {
				prefs.keep.forEach(function (key) {
					keep[key] = true;
				});
			}
			collectEntries(doc).forEach(function (entry) {
				if (keep[entry.key]) {
					return;
				}
				entry.nodes.forEach(hide);
			});
		}

		return function () {
			for (var i = restorers.length - 1; i >= 0; i--) {
				restorers[i]();
			}
		};
	}

	function destroySnip() {
		if (snipKeyHandler) {
			document.removeEventListener('keydown', snipKeyHandler, true);
			snipKeyHandler = null;
		}
		if (snipCleanup) {
			snipCleanup();
			snipCleanup = null;
		}
		if (snip && snip.parentNode) {
			snip.parentNode.removeChild(snip);
		}
		snip = null;
		morePopover = null;
		var boot = document.getElementById('stillframe-snip-boot');
		if (boot && boot.parentNode) {
			boot.parentNode.removeChild(boot);
		}
		unlockScroll();
	}

	function cancelSnip() {
		session += 1;
		snipBusy = false;
		invalidateViewShot();
		leaveScene();
		destroySnip();
		focusMenu();
	}

	function normalizeRect(x1, y1, x2, y2) {
		var x = Math.min(x1, x2);
		var y = Math.min(y1, y2);
		return {
			x: x,
			y: y,
			width: Math.abs(x2 - x1),
			height: Math.abs(y2 - y1)
		};
	}

	function clampRect(rect) {
		var maxW = document.documentElement.clientWidth || window.innerWidth || 0;
		var maxH = document.documentElement.clientHeight || window.innerHeight || 0;
		var x = Math.max(0, Math.min(rect.x, maxW));
		var y = Math.max(0, Math.min(rect.y, maxH));
		var right = Math.max(x, Math.min(rect.x + rect.width, maxW));
		var bottom = Math.max(y, Math.min(rect.y + rect.height, maxH));
		return {
			x: x,
			y: y,
			width: right - x,
			height: bottom - y
		};
	}

	function canvasToBlob(canvas) {
		return new Promise(function (resolve, reject) {
			canvas.toBlob(function (blob) {
				if (!blob) {
					var error = new Error('failed');
					error.code = 'failed';
					reject(error);
					return;
				}
				resolve(blob);
			}, 'image/png');
		});
	}

	function cropCanvasSync(canvas, rect, scale) {
		var sx = Math.max(0, Math.round(rect.x * scale));
		var sy = Math.max(0, Math.round(rect.y * scale));
		var sw = Math.max(1, Math.round(rect.width * scale));
		var sh = Math.max(1, Math.round(rect.height * scale));
		if (sx >= canvas.width || sy >= canvas.height) {
			var outside = new Error('failed');
			outside.code = 'failed';
			throw outside;
		}
		if (sx + sw > canvas.width) {
			sw = canvas.width - sx;
		}
		if (sy + sh > canvas.height) {
			sh = canvas.height - sy;
		}
		var out = document.createElement('canvas');
		out.width = Math.max(1, sw);
		out.height = Math.max(1, sh);
		var ctx = out.getContext('2d');
		if (!ctx) {
			var failed = new Error('failed');
			failed.code = 'failed';
			throw failed;
		}
		ctx.imageSmoothingEnabled = false;
		ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
		return out;
	}

	function cropCanvasToBlob(canvas, rect, scale) {
		try {
			return canvasToBlob(cropCanvasSync(canvas, rect, scale));
		} catch (error) {
			return Promise.reject(error);
		}
	}

	function markElements(doc, crop) {
		var marked = [];
		var win = doc.defaultView;
		var all = doc.body ? doc.body.getElementsByTagName('*') : [];
		var i;
		for (i = 0; i < all.length; i++) {
			var el = all[i];
			var style;
			try {
				style = win.getComputedStyle(el);
			} catch (error) {
				continue;
			}
			if (style.position === 'fixed' && !(el.parentElement && el.parentElement.closest('[data-stillframe-fixed]'))) {
				el.setAttribute('data-stillframe-fixed', '1');
				marked.push([el, 'data-stillframe-fixed']);
			}
			// Images that are far outside the captured area would only slow the
			// render down. Their boxes stay, so the layout does not move.
			var tag = el.tagName;
			var heavy = tag === 'IMG' || tag === 'VIDEO' || tag === 'CANVAS' || (style.backgroundImage && style.backgroundImage !== 'none');
			if (heavy) {
				var rect = el.getBoundingClientRect();
				if (rect.bottom < crop.y - 200 || rect.top > crop.y + crop.height + 200 || rect.right < crop.x - 200 || rect.left > crop.x + crop.width + 200) {
					el.setAttribute('data-stillframe-off', '1');
					marked.push([el, 'data-stillframe-off']);
				}
			}
		}
		return function () {
			marked.forEach(function (item) {
				item[0].removeAttribute(item[1]);
			});
		};
	}

	function prepareClone(root, view, crop) {
		if (!root || root.nodeType !== 1) {
			return;
		}
		var doc = view.document;
		Array.prototype.forEach.call(root.querySelectorAll('[data-stillframe-off]'), function (node) {
			if (node.tagName === 'IMG') {
				node.removeAttribute('srcset');
				node.setAttribute('src', 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7');
			} else {
				node.style.setProperty('background-image', 'none', 'important');
			}
		});
		var sx = (view.scrollX || doc.documentElement.scrollLeft || 0) + (crop ? crop.x : 0);
		var sy = (view.scrollY || doc.documentElement.scrollTop || 0) + (crop ? crop.y : 0);
		if (!sx && !sy) {
			return;
		}
		root.style.setProperty('overflow', 'hidden', 'important');
		var body = root.querySelector('body');
		if (!body) {
			return;
		}
		body.style.setProperty('transform', 'translate(' + (-sx) + 'px,' + (-sy) + 'px)', 'important');
		body.style.setProperty('transform-origin', '0 0', 'important');
		// A transformed body becomes the containing block of fixed elements, so
		// they are moved back to where the viewport actually showed them.
		var bodyRect = doc.body.getBoundingClientRect();
		var shift = (-bodyRect.left) + 'px ' + (-bodyRect.top) + 'px';
		Array.prototype.forEach.call(root.querySelectorAll('[data-stillframe-fixed]'), function (node) {
			node.style.setProperty('translate', shift, 'important');
		});
	}

	function makeFilter() {
		return function (nodeToKeep) {
			if (!nodeToKeep || nodeToKeep.nodeType !== 1) {
				return true;
			}
			var tag = nodeToKeep.tagName;
			if (tag === 'SCRIPT' || tag === 'NOSCRIPT') {
				return false;
			}
			if (nodeToKeep.classList && (
				nodeToKeep.classList.contains('stillframe-snip') ||
				nodeToKeep.classList.contains('stillframe-result') ||
				nodeToKeep.classList.contains('stillframe-capture-panel') ||
				nodeToKeep.classList.contains('stillframe-capture-frame')
			)) {
				return false;
			}
			return true;
		};
	}

	// Use the page's own background colour behind transparent areas; white when it has none.
	function pageBackground(view) {
		try {
			var doc = view.document;
			var nodes = [doc.body, doc.documentElement];
			for (var i = 0; i < nodes.length; i++) {
				var color = nodes[i] ? view.getComputedStyle(nodes[i]).backgroundColor : '';
				if (color && color !== 'transparent' && !/^rgba\(\s*0,\s*0,\s*0,\s*0\s*\)$/.test(color)) {
					return color;
				}
			}
		} catch (error) {
			return '#ffffff';
		}
		return '#ffffff';
	}

	function renderCanvas(node, scale, bounds, view) {
		view = view || window;
		if (!window.modernScreenshot || typeof window.modernScreenshot.domToCanvas !== 'function') {
			var missing = new Error('library');
			missing.code = 'library';
			return Promise.reject(missing);
		}
		var crop = bounds && bounds.crop ? bounds.crop : null;
		var unmark = crop ? markElements(view.document, crop) : function () {};
		try {
			var options = {
				scale: scale,
				backgroundColor: pageBackground(view),
				maximumCanvasSize: 0,
				timeout: 15000,
				features: {
					restoreScrollPosition: false,
					copyScrollbar: false,
					fixSvgXmlDecode: false
				},
				filter: makeFilter(),
				onCloneNode: function (cloned) {
					try {
						prepareClone(cloned, view, crop);
					} catch (cloneError) {
						return;
					}
				}
			};
			if (bounds && bounds.width && bounds.height) {
				options.width = bounds.width;
				options.height = bounds.height;
			}
			return window.modernScreenshot.domToCanvas(node, options).then(function (canvas) {
				unmark();
				return canvas;
			}, function (error) {
				unmark();
				throw error;
			});
		} catch (error) {
			unmark();
			if (error && !error.code) {
				error.code = 'failed';
			}
			return Promise.reject(error);
		}
	}

	function shoot(node, scale, bounds, view) {
		return renderCanvas(node, scale, bounds, view).then(function (canvas) {
			if (bounds && bounds.crop) {
				return cropCanvasToBlob(canvas, bounds.crop, scale);
			}
			return canvasToBlob(canvas);
		});
	}

	// Load lazy images and wait for fonts and images before the shot.
	function warmFrame(local) {
		var win = local.contentWindow;
		var doc = local.contentDocument;
		var wait = function (ms) {
			return new Promise(function (resolve) {
				window.setTimeout(resolve, ms);
			});
		};
		try {
			Array.prototype.forEach.call(doc.querySelectorAll('img[loading="lazy"]'), function (img) {
				img.setAttribute('loading', 'eager');
			});
			Array.prototype.forEach.call(doc.querySelectorAll('img[data-src], img[data-lazy-src], img[data-srcset]'), function (img) {
				var src = img.getAttribute('data-src') || img.getAttribute('data-lazy-src');
				var current = img.getAttribute('src') || '';
				if (src && (!current || /^data:/.test(current))) {
					img.setAttribute('src', src);
				}
				var srcset = img.getAttribute('data-srcset');
				if (srcset) {
					img.setAttribute('srcset', srcset);
				}
			});
		} catch (error) {
			return Promise.resolve();
		}
		var total = Math.max(doc.documentElement.scrollHeight, doc.body ? doc.body.scrollHeight : 0);
		var step = Math.max(300, win.innerHeight || 800);
		var chain = Promise.resolve();
		for (var y = step; y < total && y < step * 40; y += step) {
			(function (top) {
				chain = chain.then(function () {
					win.scrollTo(0, top);
					return wait(120);
				});
			})(y);
		}
		return chain.then(function () {
			win.scrollTo(0, 0);
			var fonts = doc.fonts && doc.fonts.ready ? doc.fonts.ready : Promise.resolve();
			var images = Array.prototype.map.call(doc.images || [], function (img) {
				if (img.complete) {
					return Promise.resolve();
				}
				return new Promise(function (resolve) {
					img.addEventListener('load', resolve);
					img.addEventListener('error', resolve);
				});
			});
			return Promise.race([Promise.all([fonts].concat(images)), wait(6000)]);
		}).catch(function () {
			return null;
		});
	}

	function prepareAndShoot(local, scale, options) {
		options = options || {};
		var restore = function () {};

		function restoreOnce() {
			var fn = restore;
			restore = function () {};
			fn();
		}

		return waitForReady(local.contentDocument).then(function () {
			return canReadFrame(local) ? warmFrame(local) : null;
		}).then(function () {
			if (!canReadFrame(local)) {
				var blocked = new Error('blocked');
				blocked.code = 'blocked';
				throw blocked;
			}
			var prefs = readPrefs();
			if (options && typeof options.hideAdminBar === 'boolean') {
				prefs.adminBar = !options.hideAdminBar;
			}
			restore = applyScene(local.contentDocument, prefs);
			var frameWidth = parseInt(local.style.width, 10) || local.clientWidth || 1;
			var frameHeight;
			if (options.fullPage === false) {
				if (options.viewportHeight) {
					frameHeight = parseInt(options.viewportHeight, 10);
				} else if (frameWidth <= 480) {
					frameHeight = 844;
				} else if (frameWidth <= 1024) {
					frameHeight = 1112;
				} else {
					frameHeight = 900;
				}
			} else {
				frameHeight = measureHeight(local.contentDocument);
			}
			local.style.height = frameHeight + 'px';
			return nextFrames(1);
		}).then(function () {
			if (!canReadFrame(local)) {
				restoreOnce();
				var blockedLater = new Error('blocked');
				blockedLater.code = 'blocked';
				throw blockedLater;
			}
			var doc = local.contentDocument;
			var frameWidth = parseInt(local.style.width, 10) || local.clientWidth || 1;
			var frameHeight = parseInt(local.style.height, 10) || measureHeight(doc);
			var fitScale = safeScale(frameWidth, frameHeight, scale);
			if (fitScale < scale) {
				setStatus('Scaled to ' + fitScale + 'x to fit browser limits.', '', '', 'busy');
			}
			return shoot(doc.documentElement, fitScale, {
				width: frameWidth,
				height: frameHeight,
				fullPage: options.fullPage !== false
			}, local.contentWindow);
		}).then(function (blob) {
			restoreOnce();
			return blob;
		}, function (error) {
			restoreOnce();
			throw error;
		});
	}

	function getViewCanvas() {
		if (viewShot.canvas) {
			return Promise.resolve(viewShot.canvas);
		}
		var pending = viewShot.work || startViewShot();
		return pending.then(function (canvas) {
			return canvas || getViewCanvas();
		});
	}

	function captureRect(rect) {
		rect = clampRect(rect);
		if (snipBusy || rect.width < 8 || rect.height < 8) {
			return;
		}
		var token = session;

		function compatCapture() {
			var work = getViewCanvas().then(function (canvas) {
				return cropCanvasToBlob(canvas, rect, viewShot.scale);
			});
			openResult(rect, work, token);
			destroySnip();
		}

		if (exactEnabled()) {
			var hideEl = snip;
			snipBusy = true;
			grabExact(rect, hideEl).then(function (result) {
				if (token !== session) {
					return;
				}
				rect.scale = result.scale;
				keepExactAlive();
				openResult(rect, Promise.resolve(result.blob), token);
				destroySnip();
			}).catch(function () {
				if (hideEl) {
					hideEl.style.visibility = '';
				}
				snipBusy = false;
				if (token !== session) {
					return;
				}
				// Denied or unsupported: use the compatible DOM render for the rest of this page view.
				exact.failed = true;
				stopExact();
				compatCapture();
			});
			return;
		}
		compatCapture();
	}

	function exportBlob() {
		if (!editor) {
			return Promise.reject(new Error('editor'));
		}
		if (!editor.hasMarks() && captured && captured.blob) {
			return Promise.resolve(captured.blob);
		}
		return editor.flatten();
	}

	function pendingLabel(kind) {
		return kind === 'media' ? mediaButton : downloadButton;
	}

	function setActionLoading(button, loading) {
		if (!button) {
			return;
		}
		button.classList.toggle('is-loading', !!loading);
		if (loading) {
			button.setAttribute('aria-busy', 'true');
		} else {
			button.removeAttribute('aria-busy');
		}
	}

	function runDownload() {
		if (!editor || !captured) {
			return;
		}
		var button = downloadButton;
		setActionLoading(button, true);
		exportBlob().then(function (blob) {
			saveBlob(blob, fileNameFor(captured.url, captured.width, captured.scale));
			if (!panel) {
				return;
			}
			setActionLoading(button, false);
			setStatus(text('downloaded') || 'Downloaded.', '', '', 'success');
		}).catch(function () {
			if (!panel) {
				return;
			}
			setActionLoading(button, false);
			setStatus(text('downloadFailed'), '', '', 'error');
		});
	}

	function requestAction(kind) {
		if (!resultReady) {
			pendingAction = kind;
			setActionLoading(pendingLabel(kind), true);
			setStatus(text('queued') || 'Almost there. This will finish as soon as the capture is ready.', '', '', 'busy');
			return;
		}
		if (kind === 'media') {
			saveToMedia();
		} else {
			runDownload();
		}
	}

	function flushPending() {
		var kind = pendingAction;
		pendingAction = '';
		if (!kind) {
			return;
		}
		setActionLoading(pendingLabel(kind), false);
		requestAction(kind);
	}

	function fitResultImage() {
		var image = canvasWrap ? canvasWrap.querySelector('img') : null;
		var stage = editorSection;
		if (!image || !stage || !image.naturalWidth || !image.naturalHeight) {
			return;
		}
		var scale = captured && captured.scale ? captured.scale : 1;
		var availW = Math.max(60, stage.clientWidth - 16);
		var availH = Math.max(60, stage.clientHeight - 16);
		var w = image.naturalWidth / scale;
		var h = image.naturalHeight / scale;
		var ratio = Math.min(1, availW / w, availH / h);
		image.style.width = Math.max(1, Math.floor(w * ratio)) + 'px';
		image.style.height = Math.max(1, Math.floor(h * ratio)) + 'px';
	}

	function loadResultImage(blob) {
		return new Promise(function (resolve, reject) {
			if (objectUrl) {
				URL.revokeObjectURL(objectUrl);
				objectUrl = '';
			}
			objectUrl = URL.createObjectURL(blob);
			var image = new Image();
			image.alt = text('capturedAlt');
			image.draggable = false;
			image.onload = function () {
				resolve(image);
			};
			image.onerror = function () {
				var failed = new Error('failed');
				failed.code = 'failed';
				reject(failed);
			};
			image.src = objectUrl;
		});
	}

	function showLoader(message) {
		clearWrap();
		var loader = element('div', { className: 'stillframe-result__loader', role: 'status' });
		loader.appendChild(element('span', { className: 'stillframe-result__spinner', 'aria-hidden': 'true' }));
		loader.appendChild(element('span', { text: message }));
		canvasWrap.appendChild(loader);
	}

	function svgNode(name, attrs) {
		var node = document.createElementNS('http://www.w3.org/2000/svg', name);
		if (attrs) {
			Object.keys(attrs).forEach(function (key) {
				node.setAttribute(key, attrs[key]);
			});
		}
		return node;
	}

	var ICONS = {
		area: [
			{ tag: 'rect', x: '4', y: '5', width: '16', height: '14', rx: '2.5', 'stroke-dasharray': '3.2 2.6' }
		],
		window: [
			{ tag: 'rect', x: '3.5', y: '5', width: '17', height: '14', rx: '2.5' },
			{ d: 'M3.5 9.5h17' },
			{ tag: 'circle', cx: '6.6', cy: '7.3', r: '0.5' }
		],
		full: [
			{ d: 'M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15' }
		],
		close: [
			{ d: 'M6 6l12 12M18 6L6 18' }
		],
		check: [
			{ d: 'M20 6L9 17l-5-5' }
		],
		page: [
			{ tag: 'path', d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' },
			{ tag: 'polyline', points: '14 2 14 8 20 8' },
			{ tag: 'line', x1: '16', y1: '13', x2: '8', y2: '13' },
			{ tag: 'line', x1: '16', y1: '17', x2: '8', y2: '17' }
		],
		recent: [
			{ tag: 'circle', cx: '12', cy: '12', r: '9' },
			{ d: 'M12 7v5l3 2' }
		],
		trash: [
			{ d: 'M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z' }
		],
		edit: [
			{ d: 'M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z' }
		],
		camera: [
			{ tag: 'path', d: 'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z' },
			{ tag: 'circle', cx: '12', cy: '13', r: '4' }
		],
		pen: [
			{ d: 'M4 20l1-4.2L16.6 4.2a2.1 2.1 0 0 1 3 3L8.2 19 4 20z' },
			{ d: 'M14.5 6.3l3.2 3.2' }
		],
		circle: [
			{ tag: 'ellipse', cx: '12', cy: '12', rx: '8', ry: '6.5' }
		],
		arrow: [
			{ d: 'M5 19L18.5 5.5M9.5 5h9.5v9.5' }
		],
		select: [
			{ d: 'M6 3.5l12 6.3-5.2 1.7L10.6 17z' }
		],
		rect: [
			{ tag: 'rect', x: '4', y: '6', width: '16', height: '12', rx: '1.5' }
		],
		highlight: [
			{ tag: 'rect', x: '4', y: '8', width: '16', height: '8', rx: '1.5', fill: 'currentColor', 'fill-opacity': '0.28' },
			{ d: 'M4 8h16M4 16h16' }
		],
		text: [
			{ d: 'M5 6.5V5h14v1.5M12 5v14M9 19h6' }
		],
		step: [
			{ tag: 'circle', cx: '12', cy: '12', r: '9' },
			{ d: 'M10.4 9.8l2.2-1.6V16' }
		],
		blur: [
			{ tag: 'rect', x: '4', y: '4', width: '7', height: '7', rx: '1', fill: 'currentColor', 'fill-opacity': '0.35' },
			{ tag: 'rect', x: '13', y: '13', width: '7', height: '7', rx: '1', fill: 'currentColor', 'fill-opacity': '0.35' },
			{ tag: 'rect', x: '13', y: '4', width: '7', height: '7', rx: '1' },
			{ tag: 'rect', x: '4', y: '13', width: '7', height: '7', rx: '1' }
		],
		undo: [
			{ d: 'M9 14L4 9l5-5' },
			{ d: 'M4 9h10a6 6 0 0 1 0 12h-3' }
		],
		clear: [
			{ d: 'M4 7h16M9.5 11v6M14.5 11v6M6 7l.9 11.2A2 2 0 0 0 8.9 20h6.2a2 2 0 0 0 2-1.8L18 7M9 7V4.5h6V7' }
		],
		download: [
			{ d: 'M12 4v11M7.5 11L12 15.5 16.5 11M5 20h14' }
		],
		media: [
			{ tag: 'rect', x: '3.5', y: '4.5', width: '17', height: '15', rx: '2.5' },
			{ tag: 'circle', cx: '9', cy: '10', r: '1.6' },
			{ d: 'M20.5 16l-5-5L8 19.5' }
		],
		desktop: [
			{ tag: 'rect', x: '2', y: '3', width: '20', height: '14', rx: '2' },
			{ d: 'M8 21h8M12 17v4' }
		],
		tablet: [
			{ tag: 'rect', x: '4', y: '2', width: '16', height: '20', rx: '2' },
			{ d: 'M12 18h.01' }
		],
		mobile: [
			{ tag: 'rect', x: '5', y: '2', width: '14', height: '20', rx: '2' },
			{ d: 'M12 18h.01' }
		],
		devices: [
			{ tag: 'rect', x: '2', y: '4', width: '13', height: '11', rx: '1.5' },
			{ tag: 'rect', x: '11', y: '9', width: '11', height: '12', rx: '1.5' }
		],
		chevronDown: [
			{ d: 'M6 9l6 6 6-6' }
		]
	};

	function iconSvg(name, size) {
		var svg = svgNode('svg', {
			viewBox: '0 0 24 24',
			width: String(size || 18),
			height: String(size || 18),
			fill: 'none',
			stroke: 'currentColor',
			'stroke-width': '1.8',
			'stroke-linecap': 'round',
			'stroke-linejoin': 'round',
			'aria-hidden': 'true',
			focusable: 'false'
		});
		(ICONS[name] || []).forEach(function (spec) {
			var attrs = {};
			Object.keys(spec).forEach(function (key) {
				if (key !== 'tag') {
					attrs[key] = spec[key];
				}
			});
			svg.appendChild(svgNode(spec.tag || 'path', attrs));
		});
		return svg;
	}

	function iconButton(name, label, className, showLabel, hint) {
		var button = element('button', {
			type: 'button',
			className: className || '',
			'aria-label': label,
			title: hint || label
		});
		button.appendChild(iconSvg(name, showLabel ? 18 : 20));
		if (showLabel) {
			button.appendChild(element('span', { className: 'stillframe-btn__label', text: showLabel === true ? label : showLabel }));
		}
		return button;
	}

	var SWATCHES = ['#ef4444', '#f59e0b', '#facc15', '#059669', '#005976', '#3b82f6', '#ffffff', '#111827'];
	var SIZES = [2.5, 4, 7];

	var RECENT_KEY = 'stillframe_recent_captures_v1';
	var RECENT_MAX = 20;
	var RECENT_BYTES = 200 * 1024 * 1024;
	var recentBlobs = {};

	// Full-size originals live in IndexedDB; localStorage keeps only small thumbnails.
	function idbRun(mode, work) {
		return new Promise(function (resolve, reject) {
			if (!window.indexedDB) {
				reject(new Error('idb'));
				return;
			}
			var open = window.indexedDB.open('stillframe', 1);
			open.onupgradeneeded = function () {
				open.result.createObjectStore('recent', { keyPath: 'id' });
			};
			open.onerror = function () {
				reject(open.error);
			};
			open.onsuccess = function () {
				var db = open.result;
				var tx = db.transaction('recent', mode);
				var request = work(tx.objectStore('recent'));
				tx.oncomplete = function () {
					db.close();
					resolve(request ? request.result : undefined);
				};
				tx.onerror = function () {
					db.close();
					reject(tx.error);
				};
			};
		});
	}

	function recentGetBlob(id) {
		if (recentBlobs[id]) {
			return Promise.resolve(recentBlobs[id]);
		}
		return idbRun('readonly', function (store) {
			return store.get(id);
		}).then(function (row) {
			return row && row.blob ? row.blob : null;
		}).catch(function () {
			return null;
		});
	}

	// Drop originals that are no longer in the list, and the oldest ones past the size cap.
	function recentPrune(list) {
		return idbRun('readwrite', function (store) {
			var all = store.getAll();
			all.onsuccess = function () {
				var byId = {};
				(all.result || []).forEach(function (row) {
					byId[row.id] = row;
				});
				var total = 0;
				var keep = {};
				list.forEach(function (item) {
					var row = byId[item.id];
					if (row && total + (row.size || 0) <= RECENT_BYTES) {
						total += row.size || 0;
						keep[item.id] = true;
					}
				});
				Object.keys(byId).forEach(function (id) {
					if (!keep[id]) {
						store.delete(id);
					}
				});
			};
			return all;
		}).catch(function () {
			return null;
		});
	}

	function formatBytes(bytes) {
		if (bytes >= 1048576) {
			return (bytes / 1048576).toFixed(1) + ' MB';
		}
		return Math.max(1, Math.round(bytes / 1024)) + ' KB';
	}

	function getRecentCaptures() {
		try {
			var raw = window.localStorage.getItem(RECENT_KEY);
			if (!raw) return [];
			var list = JSON.parse(raw);
			return Array.isArray(list) ? list.slice(0, RECENT_MAX) : [];
		} catch (e) {
			return [];
		}
	}

	function saveRecentList(list) {
		// Thumbnails are the bulk of the payload; if storage is full, drop the oldest until it fits.
		while (list.length) {
			try {
				window.localStorage.setItem(RECENT_KEY, JSON.stringify(list));
				return;
			} catch (e) {
				list.pop();
			}
		}
	}

	function deleteRecentCapture(id) {
		try {
			var list = getRecentCaptures().filter(function (it) { return it.id !== id; });
			window.localStorage.setItem(RECENT_KEY, JSON.stringify(list));
			delete recentBlobs[id];
		} catch (e) {}
		idbRun('readwrite', function (store) {
			return store.delete(id);
		}).catch(function () {
			return null;
		});
	}

	function formatRecentTime(ts) {
		var diff = Math.max(0, Math.floor((Date.now() - ts) / 1000));
		if (diff < 10) return 'Just now';
		if (diff < 60) return diff + 's ago';
		var mins = Math.floor(diff / 60);
		if (mins < 60) return mins + 'm ago';
		var hours = Math.floor(mins / 60);
		if (hours < 24) return hours + 'h ago';
		return Math.floor(hours / 24) + 'd ago';
	}

	function saveCaptureToRecent(blob, width, height, title, url) {
		if (!blob || !width || !height) return;
		var id = 'sf_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
		recentBlobs[id] = blob;
		idbRun('readwrite', function (store) {
			return store.put({ id: id, blob: blob, size: blob.size, timestamp: Date.now() });
		}).catch(function () {
			return null;
		});

		var img = new Image();
		var objUrl = URL.createObjectURL(blob);
		img.onload = function () {
			try {
				var maxW = 480;
				var r = Math.min(1, maxW / (img.naturalWidth || width));
				var thumbCanvas = document.createElement('canvas');
				thumbCanvas.width = Math.max(1, Math.round((img.naturalWidth || width) * r));
				thumbCanvas.height = Math.max(1, Math.round((img.naturalHeight || height) * r));
				var ctx = thumbCanvas.getContext('2d');
				ctx.drawImage(img, 0, 0, thumbCanvas.width, thumbCanvas.height);
				var thumbData = thumbCanvas.toDataURL('image/jpeg', 0.85);

				var cleanTitle = title || '';
				if (!cleanTitle || cleanTitle.indexOf('http') === 0) {
					try {
						cleanTitle = new URL(url || window.location.href).pathname || 'Screenshot';
						if (cleanTitle === '/') cleanTitle = 'Home Page';
					} catch (e) {
						cleanTitle = 'Screenshot';
					}
				}

				var item = {
					id: id,
					title: cleanTitle,
					url: url || window.location.href,
					width: width,
					height: height,
					timestamp: Date.now(),
					size: blob.size,
					pixelWidth: img.naturalWidth || width,
					thumb: thumbData
				};

				var list = getRecentCaptures();
				list.unshift(item);
				if (list.length > RECENT_MAX) list = list.slice(0, RECENT_MAX);
				saveRecentList(list);
				recentPrune(list);
			} catch (err) {
				console.warn('Stillframe recent save error', err);
			} finally {
				URL.revokeObjectURL(objUrl);
			}
		};
		img.onerror = function () {
			URL.revokeObjectURL(objUrl);
		};
		img.src = objUrl;
	}

	function openRecentCaptureInEditor(item) {
		var token = ++session;
		var rect = {
			x: 0,
			y: 0,
			width: item.width || 1440,
			height: item.height || 900,
			scale: 1,
			url: item.url || window.location.href,
			fromRecent: true
		};
		recentGetBlob(item.id).then(function (blob) {
			if (!blob || token !== session) {
				return;
			}
			openResult(rect, Promise.resolve(blob), token);
		});
	}

	function uploadRecentToMedia(item, btn) {
		if (!config.canUpload || !config.ajaxUrl || !config.mediaNonce) return;
		var getBlobPromise = recentGetBlob(item.id).then(function (blob) {
			if (!blob) {
				throw new Error('missing');
			}
			return blob;
		});

		if (btn) btn.disabled = true;
		getBlobPromise.then(function (blob) {
			var body = new FormData();
			body.append('action', 'stillframe_save_media');
			body.append('nonce', String(config.mediaNonce));
			body.append('image', blob, 'stillframe-' + item.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + item.width + 'x' + item.height + '.png');
			return window.fetch(String(config.ajaxUrl), {
				method: 'POST',
				credentials: 'same-origin',
				body: body
			});
		}).then(function (res) {
			return res.json();
		}).then(function () {
			if (btn) {
				btn.disabled = false;
				btn.title = 'Saved to Media Library!';
				btn.style.color = '#059669';
				var lbl = btn.querySelector('span');
				if (lbl) lbl.textContent = 'Saved';
			}
		}).catch(function () {
			if (btn) btn.disabled = false;
		});
	}

	function renderRecentList(container, onSelect, onAction) {
		while (container.firstChild) {
			container.removeChild(container.firstChild);
		}
		var list = getRecentCaptures();
		if (list.length === 0) {
			var empty = element('div', {
				className: 'stillframe-recent-empty',
				text: 'No recent screenshots yet. Capture an area, full screen, or page to build your history.'
			});
			container.appendChild(empty);
			return;
		}
		var listWrap = element('div', { className: 'stillframe-recent-list' });
		list.forEach(function (item) {
			var card = element('div', { className: 'stillframe-recent-card' });
			var thumbWrap = element('div', { className: 'stillframe-recent-thumbwrap' });
			if (item.thumb) {
				thumbWrap.appendChild(element('img', {
					className: 'stillframe-recent-thumb',
					alt: item.title,
					src: item.thumb
				}));
			}
			card.appendChild(thumbWrap);

			var info = element('div', { className: 'stillframe-recent-info' });
			info.appendChild(element('strong', { className: 'stillframe-recent-title', text: item.title, title: item.title }));
			var meta = element('div', { className: 'stillframe-recent-meta' });
			if (item.width && item.height) {
				meta.appendChild(element('span', { className: 'stillframe-recent-chip', text: item.width + ' × ' + item.height }));
			}
			if (item.size) {
				meta.appendChild(element('span', { className: 'stillframe-recent-chip', text: formatBytes(item.size) }));
			}
			meta.appendChild(element('span', { text: formatRecentTime(item.timestamp) }));
			info.appendChild(meta);

			var actions = element('div', { className: 'stillframe-recent-actions' });
			var editBtn = element('button', {
				type: 'button',
				className: 'stillframe-recent-btn',
				title: 'Open in editor to draw and annotate'
			});
			editBtn.appendChild(iconSvg('edit', 13));
			editBtn.appendChild(element('span', { text: 'Edit' }));
			editBtn.addEventListener('click', function (e) {
				e.stopPropagation();
				if (onSelect) onSelect(item);
			});
			actions.appendChild(editBtn);

			if (config.canUpload) {
				var mediaBtn = element('button', {
					type: 'button',
					className: 'stillframe-recent-btn',
					title: 'Save to Media Library'
				});
				mediaBtn.appendChild(iconSvg('media', 13));
				mediaBtn.appendChild(element('span', { text: 'Save' }));
				mediaBtn.addEventListener('click', function (e) {
					e.stopPropagation();
					uploadRecentToMedia(item, mediaBtn);
				});
				actions.appendChild(mediaBtn);
			}

			var delBtn = element('button', {
				type: 'button',
				className: 'stillframe-recent-btn stillframe-recent-btn--del',
				title: 'Remove',
				'aria-label': 'Remove'
			});
			delBtn.appendChild(iconSvg('trash', 13));
			delBtn.addEventListener('click', function (e) {
				e.stopPropagation();
				deleteRecentCapture(item.id);
				renderRecentList(container, onSelect, onAction);
			});
			actions.appendChild(delBtn);

			info.appendChild(actions);
			card.appendChild(info);

			recentGetBlob(item.id).then(function (blob) {
				if (blob) {
					return;
				}
				editBtn.disabled = true;
				if (typeof mediaBtn !== 'undefined' && mediaBtn) {
					mediaBtn.disabled = true;
				}
				meta.appendChild(element('span', { text: 'Original no longer stored' }));
			});

			card.addEventListener('click', function () {
				if (onSelect) onSelect(item);
			});

			listWrap.appendChild(card);
		});
		container.appendChild(listWrap);
	}

	function openResult(rect, work, token, multiOptions) {
		if (editor) {
			editor.destroy();
			editor = null;
		}
		if (keyHandler) {
			document.removeEventListener('keydown', keyHandler, true);
			keyHandler = null;
		}
		if (panel && panel.parentNode) {
			panel.parentNode.removeChild(panel);
		}

		compactPanel = true;
		resultReady = false;
		pendingAction = '';
		captured = {
			width: Math.max(1, Math.round(rect.width)),
			height: Math.max(1, Math.round(rect.height)),
			scale: (rect && rect.scale) || viewShot.scale || 1,
			url: (rect && rect.url) || window.location.href,
			blob: null
		};

		var root = element('div', {
			className: 'stillframe-result',
			role: 'dialog',
			'aria-modal': 'true',
			'aria-labelledby': 'stillframe-capture-heading'
		});
		var win = element('div', { className: 'stillframe-result__window' });
		var heading = element('h2', {
			id: 'stillframe-capture-heading',
			className: 'stillframe-sr',
			text: text('heading')
		});
		var toolbar = element('div', { className: 'stillframe-result__toolbar' });

		var brand = element('div', { className: 'stillframe-result__brand' });
		brand.appendChild(element('span', { className: 'stillframe-result__name', text: 'Stillframe' }));
		brand.appendChild(element('span', {
			className: 'stillframe-result__dims',
			text: Math.round(captured.width).toLocaleString() + ' × ' + Math.round(captured.height).toLocaleString()
		}));

		var markGroup = element('div', {
			className: 'stillframe-result__tools',
			role: 'group',
			'aria-label': text('tools')
		});

		function addTool(name, label, key, pressed) {
			var button = iconButton(name, label, 'stillframe-tool', false, label + ' (' + key.toUpperCase() + ')');
			button.setAttribute('data-tool', name);
			button.setAttribute('data-key', key);
			button.setAttribute('aria-pressed', pressed ? 'true' : 'false');
			button.addEventListener('click', function () {
				Array.prototype.forEach.call(markGroup.querySelectorAll('.stillframe-tool'), function (item) {
					item.setAttribute('aria-pressed', item === button ? 'true' : 'false');
				});
				if (editor) {
					editor.setTool(name);
				}
			});
			markGroup.appendChild(button);
			return button;
		}

		addTool('select', text('select') || 'Select and move', 'v', false);
		penButton = addTool('pen', text('pen') || 'Pen', 'p', true);
		addTool('circle', text('circle') || 'Circle', 'c', false);
		addTool('arrow', text('arrow') || 'Arrow', 'a', false);
		addTool('rect', text('rect') || 'Rectangle', 'r', false);
		addTool('highlight', text('highlight') || 'Highlight', 'h', false);
		addTool('text', text('textTool') || 'Text', 't', false);
		addTool('step', text('step') || 'Numbered step', 'n', false);
		addTool('blur', text('blur') || 'Blur (hide sensitive info)', 'b', false);

		var colorGroup = element('div', {
			className: 'stillframe-result__swatches',
			role: 'group',
			'aria-label': text('colors') || 'Color'
		});
		SWATCHES.forEach(function (hex) {
			var swatch = element('button', {
				type: 'button',
				className: 'stillframe-swatch',
				'aria-label': hex,
				title: hex
			});
			swatch.style.setProperty('--sf-swatch', hex);
			swatch.setAttribute('aria-pressed', hex === toolColor ? 'true' : 'false');
			swatch.addEventListener('click', function () {
				toolColor = hex;
				Array.prototype.forEach.call(colorGroup.querySelectorAll('.stillframe-swatch'), function (item) {
					item.setAttribute('aria-pressed', item === swatch ? 'true' : 'false');
				});
				if (editor) {
					editor.setColor(hex);
				}
			});
			colorGroup.appendChild(swatch);
		});

		var sizeGroup = element('div', {
			className: 'stillframe-result__sizes',
			role: 'group',
			'aria-label': text('thickness') || 'Line thickness'
		});
		SIZES.forEach(function (value, index) {
			var sizeButton = element('button', {
				type: 'button',
				className: 'stillframe-size',
				'aria-label': (text('thickness') || 'Line thickness') + ' ' + (index + 1),
				title: (text('thickness') || 'Line thickness') + ' ' + (index + 1)
			});
			var dot = element('span', { className: 'stillframe-size__dot' });
			dot.style.setProperty('--sf-dot', (value + 3) + 'px');
			sizeButton.appendChild(dot);
			sizeButton.setAttribute('aria-pressed', value === toolSize ? 'true' : 'false');
			sizeButton.addEventListener('click', function () {
				toolSize = value;
				Array.prototype.forEach.call(sizeGroup.querySelectorAll('.stillframe-size'), function (item) {
					item.setAttribute('aria-pressed', item === sizeButton ? 'true' : 'false');
				});
				if (editor) {
					editor.setSize(value);
				}
			});
			sizeGroup.appendChild(sizeButton);
		});

		var historyGroup = element('div', {
			className: 'stillframe-result__history',
			role: 'group'
		});
		undoButton = iconButton('undo', text('undo') || 'Undo', 'stillframe-icon-btn', false, (text('undo') || 'Undo') + ' (Ctrl+Z)');
		undoButton.disabled = true;
		undoButton.addEventListener('click', function () {
			if (editor) {
				editor.undo();
			}
		});
		clearButton = iconButton('clear', text('clear') || 'Clear', 'stillframe-icon-btn', false, text('clear') || 'Clear');
		clearButton.disabled = true;
		clearButton.addEventListener('click', function () {
			if (editor) {
				editor.clear();
			}
		});
		historyGroup.appendChild(undoButton);
		historyGroup.appendChild(clearButton);

		var toolsWrap = element('div', { className: 'stillframe-result__editing' });
		toolsWrap.appendChild(markGroup);
		toolsWrap.appendChild(colorGroup);
		toolsWrap.appendChild(sizeGroup);
		toolsWrap.appendChild(historyGroup);

		var saveGroup = element('div', { className: 'stillframe-result__actions' });
		var recentDrawerButton = iconButton('recent', text('recent') || 'Recent', 'stillframe-btn', true, 'Recent Screenshots');
		recentDrawerButton.addEventListener('click', function () {
			toggleRecentDrawer();
		});
		mediaButton = iconButton('media', text('saveMedia'), 'stillframe-btn', true);
		mediaButton.addEventListener('click', function () {
			requestAction('media');
		});
		if (!config.canUpload) {
			mediaButton.hidden = true;
		}
		downloadButton = iconButton('download', text('download'), 'stillframe-btn stillframe-btn-primary', true);
		downloadButton.addEventListener('click', function () {
			requestAction('download');
		});
		var closeButton = iconButton('close', text('close'), 'stillframe-btn stillframe-result__close', false, text('close') + ' (Esc)');
		closeButton.addEventListener('click', function () {
			api.closePanel();
		});
		var formatSelect = element('select', { className: 'stillframe-format-select', 'aria-label': 'Export format', title: 'Export format' });
		[['png', 'PNG'], ['jpeg', 'JPEG'], ['webp', 'WebP']].forEach(function (opt) {
			formatSelect.appendChild(element('option', { value: opt[0], text: opt[1] }));
		});
		formatSelect.value = exportFormat();
		formatSelect.addEventListener('change', function () {
			try {
				window.localStorage.setItem(EXPORT_KEY, formatSelect.value);
			} catch (error) {
				return;
			}
		});
		saveGroup.appendChild(recentDrawerButton);
		saveGroup.appendChild(formatSelect);
		saveGroup.appendChild(mediaButton);
		saveGroup.appendChild(downloadButton);
		saveGroup.appendChild(closeButton);

		toolbar.appendChild(brand);
		toolbar.appendChild(toolsWrap);
		toolbar.appendChild(saveGroup);

		statusNode = element('p', {
			className: 'stillframe-result__status',
			role: 'status'
		});

		var stage = element('div', { className: 'stillframe-result__stage' });
		canvasWrap = element('div', { className: 'stillframe-capture-panel__canvas-wrap' });
		stage.appendChild(canvasWrap);
		editorSection = stage;

		var drawer = element('div', { className: 'stillframe-result__drawer' });
		drawer.hidden = true;
		var drawerHead = element('div', { className: 'stillframe-result__drawer-head' });
		drawerHead.appendChild(element('strong', { text: 'Recent Screenshots' }));
		var drawerClose = element('button', { type: 'button', className: 'stillframe-result__drawer-close', title: 'Close' });
		drawerClose.appendChild(iconSvg('close', 14));
		drawerClose.addEventListener('click', function () {
			drawer.hidden = true;
			recentDrawerButton.setAttribute('aria-expanded', 'false');
		});
		drawerHead.appendChild(drawerClose);
		drawer.appendChild(drawerHead);

		var drawerBody = element('div', { className: 'stillframe-result__drawer-body' });
		drawer.appendChild(drawerBody);

		function toggleRecentDrawer() {
			var isHidden = !drawer.hidden;
			drawer.hidden = isHidden;
			recentDrawerButton.setAttribute('aria-expanded', isHidden ? 'false' : 'true');
			if (!isHidden) {
				renderRecentList(drawerBody, function (item) {
					openRecentCaptureInEditor(item);
				});
			}
		}

		// Main Body (Sidebar + Stage + Drawer)
		var mainBody = element('div', { className: 'stillframe-result__body' });

		// Multi-device Left Sidebar
		var hasMulti = multiOptions && Array.isArray(multiOptions.devices) && multiOptions.devices.length > 1;
		var devicesList = (multiOptions && multiOptions.devices) || [];
		var currentDeviceId = multiOptions && multiOptions.activeDeviceId ? multiOptions.activeDeviceId : (devicesList[0] ? devicesList[0].id : '');
		var currentDevice = devicesList.find(function (d) { return d.id === currentDeviceId; }) || devicesList[0] || null;
		var tabElements = {};

		var sidebar = element('aside', {
			className: 'stillframe-result__sidebar',
			role: 'region',
			'aria-label': 'Captured Devices'
		});
		if (!hasMulti) {
			sidebar.hidden = true;
		}

		var sidebarHead = element('div', { className: 'stillframe-result__sidebar-head' });
		sidebarHead.appendChild(element('span', { text: 'Viewports' }));
		sidebarHead.appendChild(element('span', {
			className: 'stillframe-result__sidebar-badge',
			text: devicesList.length + ' Devices'
		}));
		sidebar.appendChild(sidebarHead);

		var sidebarList = element('div', { className: 'stillframe-result__sidebar-list', role: 'tablist' });

		function updateDeviceTabPreview(dev) {
			var tab = tabElements[dev.id];
			if (!tab) return;
			var preview = tab.querySelector('.stillframe-device-tab__preview');
			if (!preview) return;
			while (preview.firstChild) preview.removeChild(preview.firstChild);

			if (dev.status === 'ready' && dev.image) {
				var img = element('img', {
					src: dev.image.src,
					alt: dev.label
				});
				preview.appendChild(img);
				var resEl = tab.querySelector('.stillframe-device-tab__res');
				if (resEl) {
					resEl.textContent = dev.width + ' × ' + dev.height;
				}
			} else if (dev.status === 'error') {
				preview.appendChild(iconSvg('close', 14));
				preview.style.color = '#ef4444';
			} else {
				var spin = element('span', { className: 'stillframe-device-tab__spinner' });
				preview.appendChild(spin);
			}
		}

		function updateDeviceAnnotationBadge(dev) {
			var tab = tabElements[dev.id];
			if (!tab) return;
			var badge = tab.querySelector('.stillframe-device-tab__annotated');
			var hasMarks = dev.marks && dev.marks.length > 0;
			if (hasMarks) {
				if (!badge) {
					badge = element('span', { className: 'stillframe-device-tab__annotated', text: '✏️ Edited' });
					var info = tab.querySelector('.stillframe-device-tab__info');
					if (info) info.appendChild(badge);
				}
			} else if (badge && badge.parentNode) {
				badge.parentNode.removeChild(badge);
			}
		}

		function switchActiveDevice(targetId) {
			if (targetId === currentDeviceId && resultReady) return;
			var targetDev = devicesList.find(function (d) { return d.id === targetId; });
			if (!targetDev) return;

			// Save annotations of current active device
			if (editor && currentDevice) {
				currentDevice.marks = editor.getMarks ? editor.getMarks() : [];
				updateDeviceAnnotationBadge(currentDevice);
			}

			// Switch active device
			currentDeviceId = targetId;
			currentDevice = targetDev;
			captured.width = targetDev.width;
			captured.height = targetDev.height || targetDev.estHeight || 900;
			captured.scale = targetDev.scale || 1;
			captured.url = targetDev.url || window.location.href;
			captured.blob = targetDev.blob;

			// Update tabs
			devicesList.forEach(function (d) {
				var tab = tabElements[d.id];
				if (tab) {
					tab.classList.toggle('is-active', d.id === targetId);
					tab.setAttribute('aria-selected', d.id === targetId ? 'true' : 'false');
				}
			});

			// Update brand dimensions
			var dimsEl = win.querySelector('.stillframe-result__dims');
			if (dimsEl) {
				dimsEl.textContent = Math.round(captured.width).toLocaleString() + ' × ' + Math.round(captured.height).toLocaleString();
			}

			if (targetDev.status === 'ready' && targetDev.image) {
				setResultLoading(false);
				mountEditor(targetDev.image);
				if (editor && targetDev.marks && targetDev.marks.length) {
					editor.setMarks(targetDev.marks);
				}
				fitResultImage();
				resultReady = true;
				setStatus('');
			} else if (targetDev.status === 'error') {
				clearWrap();
				canvasWrap.appendChild(element('div', {
					className: 'stillframe-result__loader is-error',
					text: text('captureFailed') || 'The capture failed for this device.'
				}));
				setResultLoading(false);
				resultReady = false;
			} else {
				showLoader('Capturing ' + targetDev.label + ' (' + targetDev.width + 'px)…');
				setResultLoading(true);
				resultReady = false;
			}
		}

		devicesList.forEach(function (dev) {
			var tab = element('button', {
				type: 'button',
				className: 'stillframe-device-tab' + (dev.id === currentDeviceId ? ' is-active' : ''),
				role: 'tab',
				'aria-selected': dev.id === currentDeviceId ? 'true' : 'false'
			});

			var preview = element('div', { className: 'stillframe-device-tab__preview' });
			var spin = element('span', { className: 'stillframe-device-tab__spinner' });
			preview.appendChild(spin);
			tab.appendChild(preview);

			var info = element('div', { className: 'stillframe-device-tab__info' });
			info.appendChild(element('span', { className: 'stillframe-device-tab__name', text: dev.label }));
			info.appendChild(element('span', { className: 'stillframe-device-tab__res', text: dev.width + 'px' }));
			tab.appendChild(info);

			tab.addEventListener('click', function () {
				switchActiveDevice(dev.id);
			});

			tabElements[dev.id] = tab;
			sidebarList.appendChild(tab);
		});
		sidebar.appendChild(sidebarList);

		if (hasMulti) {
			var sidebarFoot = element('div', { className: 'stillframe-result__sidebar-foot' });

			if (config.canUpload) {
				var saveAllBtn = element('button', {
					type: 'button',
					className: 'stillframe-sidebar-action-btn stillframe-sidebar-action-btn--primary',
					text: 'Save All to Media'
				});
				saveAllBtn.insertBefore(iconSvg('media', 14), saveAllBtn.firstChild);
				saveAllBtn.addEventListener('click', function () {
					saveAllDevices(saveAllBtn);
				});
				sidebarFoot.appendChild(saveAllBtn);
			}

			var dlAllBtn = element('button', {
				type: 'button',
				className: 'stillframe-sidebar-action-btn',
				text: 'Download All'
			});
			dlAllBtn.insertBefore(iconSvg('download', 14), dlAllBtn.firstChild);
			dlAllBtn.addEventListener('click', function () {
				downloadAllDevices(dlAllBtn);
			});
			sidebarFoot.appendChild(dlAllBtn);

			sidebar.appendChild(sidebarFoot);
		}

		function saveAllDevices(btn) {
			if (!config.canUpload || !config.ajaxUrl || !config.mediaNonce) {
				setStatus(text('mediaFailed'), '', '', 'error');
				return;
			}
			if (editor && currentDevice) {
				currentDevice.marks = editor.getMarks ? editor.getMarks() : [];
				updateDeviceAnnotationBadge(currentDevice);
			}
			var readyList = devicesList.filter(function (d) { return d.status === 'ready' && d.image; });
			if (!readyList.length) {
				setStatus('Captures are still preparing. Please wait a moment.', '', '', 'busy');
				return;
			}
			if (btn) btn.disabled = true;
			setStatus('Saving all ' + readyList.length + ' viewports to Media…', '', '', 'busy');

			var flattenPromises = readyList.map(function (d) {
				if (d === currentDevice && editor) {
					return exportBlob().then(function (blob) {
						return { dev: d, blob: blob };
					});
				}
				if ((!d.marks || !d.marks.length) && d.blob) {
					return Promise.resolve({ dev: d, blob: d.blob });
				}
				if (api.flattenImageAndMarks) {
					return api.flattenImageAndMarks(d.image, d.marks, d.width).then(function (blob) {
						return { dev: d, blob: blob };
					});
				}
				return Promise.resolve({ dev: d, blob: d.blob });
			});

			Promise.all(flattenPromises).then(function (items) {
				return Promise.all(items.map(function (item) {
					return exportAs(item.blob, fileNameFor(item.dev.url, item.dev.width, item.dev.scale || 1)).then(function (out) {
						item.blob = out.blob;
						item.fname = out.name;
						return item;
					});
				}));
			}).then(function (items) {
				return Promise.all(items.map(function (item) {
					var body = new FormData();
					body.append('action', 'stillframe_save_media');
					body.append('nonce', String(config.mediaNonce));
					var fname = item.fname;
					body.append('image', item.blob, fname);
					return window.fetch(String(config.ajaxUrl), {
						method: 'POST',
						credentials: 'same-origin',
						body: body
					}).then(function (r) { return r.json(); });
				}));
			}).then(function () {
				if (btn) btn.disabled = false;
				setStatus('Saved all ' + readyList.length + ' devices to Media Library!', '', '', 'success');
			}).catch(function () {
				if (btn) btn.disabled = false;
				setStatus('Some devices could not be saved to Media.', '', '', 'error');
			});
		}

		function downloadAllDevices(btn) {
			if (editor && currentDevice) {
				currentDevice.marks = editor.getMarks ? editor.getMarks() : [];
				updateDeviceAnnotationBadge(currentDevice);
			}
			var readyList = devicesList.filter(function (d) { return d.status === 'ready' && d.image; });
			if (!readyList.length) {
				setStatus('Captures are still preparing. Please wait a moment.', '', '', 'busy');
				return;
			}
			if (btn) btn.disabled = true;
			setStatus('Preparing ' + readyList.length + ' downloads…', '', '', 'busy');

			var flattenPromises = readyList.map(function (d) {
				if (d === currentDevice && editor) {
					return exportBlob().then(function (blob) {
						return { dev: d, blob: blob };
					});
				}
				if ((!d.marks || !d.marks.length) && d.blob) {
					return Promise.resolve({ dev: d, blob: d.blob });
				}
				if (api.flattenImageAndMarks) {
					return api.flattenImageAndMarks(d.image, d.marks, d.width).then(function (blob) {
						return { dev: d, blob: blob };
					});
				}
				return Promise.resolve({ dev: d, blob: d.blob });
			});

			Promise.all(flattenPromises).then(function (items) {
				if (btn) btn.disabled = false;
				items.forEach(function (item, idx) {
					window.setTimeout(function () {
						var fname = fileNameFor(item.dev.url, item.dev.width, item.dev.scale || 1);
						saveBlob(item.blob, fname);
					}, idx * 180);
				});
				setStatus('Downloaded ' + items.length + ' devices.', '', '', 'success');
			}).catch(function () {
				if (btn) btn.disabled = false;
				setStatus(text('downloadFailed') || 'Download failed.', '', '', 'error');
			});
		}

		mainBody.appendChild(sidebar);
		mainBody.appendChild(stage);
		mainBody.appendChild(drawer);

		win.appendChild(heading);
		win.appendChild(toolbar);
		win.appendChild(mainBody);
		win.appendChild(statusNode);
		root.appendChild(win);

		root.addEventListener('pointerdown', function (event) {
			if (event.target === root) {
				api.closePanel();
			}
		});

		lockScroll();
		panel = root;
		dialog = win;
		keyHandler = function (event) {
			if (event.target && event.target.classList && event.target.classList.contains('stillframe-text-input')) {
				return;
			}
			if (event.key === 'Escape') {
				event.preventDefault();
				event.stopPropagation();
				if (editor && editor.clearSelection && editor.clearSelection()) {
					return;
				}
				api.closePanel();
				return;
			}
			if ((event.ctrlKey || event.metaKey) && (event.key === 'a' || event.key === 'A')) {
				// Select every annotation; never highlight the page text underneath.
				event.preventDefault();
				if (editor && editor.selectAll) {
					editor.selectAll();
				}
				return;
			}
			if ((event.key === 'Delete' || event.key === 'Backspace') && editor && editor.deleteSelected && editor.deleteSelected()) {
				event.preventDefault();
				return;
			}
			if ((event.ctrlKey || event.metaKey) && ((event.shiftKey && (event.key === 'z' || event.key === 'Z')) || event.key === 'y' || event.key === 'Y')) {
				event.preventDefault();
				if (editor && editor.redo) {
					editor.redo();
				}
				return;
			}
			if ((event.ctrlKey || event.metaKey) && (event.key === 'z' || event.key === 'Z') && !event.shiftKey) {
				event.preventDefault();
				if (editor) {
					editor.undo();
				}
				return;
			}
			if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) {
				return;
			}
			var pick = markGroup.querySelector('.stillframe-tool[data-key="' + String(event.key).toLowerCase() + '"]');
			if (pick && !pick.disabled) {
				event.preventDefault();
				pick.click();
			}
		};
		document.addEventListener('keydown', keyHandler, true);
		document.body.appendChild(root);

		if (typeof window.ResizeObserver === 'function') {
			resultObserver = new window.ResizeObserver(fitResultImage);
			resultObserver.observe(stage);
		}

		if (work) {
			showLoader(text('capturingShort') || 'Capturing…');
			setResultLoading(true);
			if (downloadButton) {
				downloadButton.focus();
			}

			work.then(function (blob) {
				if (token !== session || !panel || !blob) {
					return null;
				}
				captured.blob = blob;
				return loadResultImage(blob);
			}).then(function (image) {
				if (!image || token !== session || !panel) {
					return;
				}
				if (image.naturalWidth && image.naturalHeight) {
					var sc = captured.scale || 1;
					captured.width = Math.round(image.naturalWidth / sc);
					captured.height = Math.round(image.naturalHeight / sc);
					var dimsEl = win.querySelector('.stillframe-result__dims');
					if (dimsEl) {
						dimsEl.textContent = captured.width.toLocaleString() + ' × ' + captured.height.toLocaleString();
					}
				}
				mountEditor(image);
				fitResultImage();
				resultReady = true;
				setResultLoading(false);
				setStatus('');
				flushPending();
				if (captured.blob && !(rect && rect.fromRecent)) {
					saveCaptureToRecent(captured.blob, captured.width, captured.height, document.title, captured.url);
				}
			}).catch(function (error) {
				if (token !== session || !panel) {
					return;
				}
				pendingAction = '';
				setActionLoading(downloadButton, false);
				setActionLoading(mediaButton, false);
				clearWrap();
				canvasWrap.appendChild(element('div', {
					className: 'stillframe-result__loader is-error',
					text: error && error.code === 'library' ? text('libraryMissing') : text('captureFailed')
				}));
				setStatus('');
				if (dialog) {
					dialog.setAttribute('aria-busy', 'false');
				}
			});
		} else {
			showLoader('Capturing ' + (currentDevice ? currentDevice.label : '') + '…');
			setResultLoading(true);
		}

		return {
			onDeviceReady: function (dev, blob, image) {
				updateDeviceTabPreview(dev);
				if (dev.id === currentDeviceId) {
					captured.blob = blob;
					captured.width = dev.width;
					captured.height = dev.height;
					var dimsEl = win.querySelector('.stillframe-result__dims');
					if (dimsEl) {
						dimsEl.textContent = captured.width.toLocaleString() + ' × ' + captured.height.toLocaleString();
					}
					mountEditor(image);
					if (dev.marks && dev.marks.length && editor) {
						editor.setMarks(dev.marks);
					}
					fitResultImage();
					resultReady = true;
					setResultLoading(false);
					setStatus('');
					flushPending();
				}
			},
			onDeviceError: function (dev) {
				updateDeviceTabPreview(dev);
				if (dev.id === currentDeviceId) {
					clearWrap();
					canvasWrap.appendChild(element('div', {
						className: 'stillframe-result__loader is-error',
						text: text('captureFailed') || 'The capture failed for this device.'
					}));
					setResultLoading(false);
					resultReady = false;
				}
			}
		};
	}

	function setResultLoading(loading) {
		if (dialog) {
			dialog.setAttribute('aria-busy', loading ? 'true' : 'false');
			dialog.classList.toggle('is-loading', !!loading);
		}
		if (!panel) {
			return;
		}
		Array.prototype.forEach.call(panel.querySelectorAll('.stillframe-tool, .stillframe-swatch, .stillframe-size'), function (button) {
			button.disabled = !!loading;
		});
		if (loading) {
			if (undoButton) {
				undoButton.disabled = true;
			}
			if (clearButton) {
				clearButton.disabled = true;
			}
		} else {
			syncMarkButtons();
		}
	}

	function openMultiDirectCapture(sourceUrl, selectedDevices, scale, hideAdminBar, isFullPage) {
		var token = ++session;
		var scaleVal = scale || 1;
		if (!selectedDevices || !selectedDevices.length) {
			selectedDevices = [
				{ id: 'desktop', label: 'Desktop', width: 1440, estHeight: 900, icon: 'desktop' },
				{ id: 'tablet',  label: 'iPad',    width: 834,  estHeight: 1112, icon: 'tablet' },
				{ id: 'mobile',  label: 'Mobile',  width: 390,  estHeight: 844,  icon: 'mobile' }
			];
		}

		var devices = selectedDevices.map(function (d) {
			var estH = d.estHeight || (d.width === 390 ? 844 : (d.width === 834 ? 1112 : 900));
			return {
				id: d.id,
				label: d.label,
				width: d.width,
				height: estH,
				estHeight: estH,
				icon: d.icon || 'desktop',
				scale: scaleVal,
				url: sourceUrl,
				status: 'loading',
				blob: null,
				image: null,
				marks: []
			};
		});

		var activeDev = devices[0];
		var initialRect = {
			x: 0,
			y: 0,
			width: activeDev.width,
			height: activeDev.estHeight,
			scale: scaleVal,
			url: sourceUrl
		};

		var controller = openResult(initialRect, null, token, {
			devices: devices,
			activeDeviceId: activeDev.id
		});

		// Run captures sequentially
		var chain = Promise.resolve();
		devices.forEach(function (dev) {
			chain = chain.then(function () {
				if (token !== session) {
					return Promise.reject(new Error('cancelled'));
				}
				return captureInFrame(sourceUrl, dev.width, scaleVal, function () {
					return token !== session;
				}, {
					fullPage: !!isFullPage,
					hideAdminBar: !!hideAdminBar
				}).then(function (blob) {
					if (token !== session || !blob) {
						return;
					}
					dev.blob = blob;
					return loadResultImage(blob).then(function (img) {
						if (token !== session) return;
						dev.image = img;
						dev.status = 'ready';
						dev.height = Math.round(img.naturalHeight / scaleVal);
						controller.onDeviceReady(dev, blob, img);
						saveCaptureToRecent(blob, dev.width, dev.height, document.title + ' (' + dev.label + ')', sourceUrl);
					});
				}).catch(function (err) {
					if (token !== session) return;
					dev.status = 'error';
					controller.onDeviceError(dev);
				});
			});
		});
	}

	function openDirectCaptureResult(sourceUrl, width, scale, hideAdminBar) {
		var dLabel = width === 390 ? 'Mobile' : (width === 834 ? 'iPad' : 'Desktop');
		var dIcon = width === 390 ? 'mobile' : (width === 834 ? 'tablet' : 'desktop');
		var dHeight = width === 390 ? 844 : (width === 834 ? 1112 : 900);
		openMultiDirectCapture(sourceUrl, [{
			id: 'dev_' + width,
			label: dLabel,
			width: width,
			estHeight: dHeight,
			icon: dIcon
		}], scale, hideAdminBar);
	}

	function openSnip() {
		if (snip) {
			return;
		}
		invalidateViewShot();
		var boot = document.getElementById('stillframe-snip-boot');
		if (boot && boot.parentNode) {
			boot.parentNode.removeChild(boot);
		}
		var root = element('div', {
			className: 'stillframe-snip',
			role: 'dialog',
			'aria-modal': 'true',
			'aria-label': text('heading') || 'Capture this screen'
		});
		root.setAttribute('data-mode', 'rect');
		var shade = element('div', { className: 'stillframe-snip__shade' });
		var box = element('div', { className: 'stillframe-snip__box' });
		var size = element('div', { className: 'stillframe-snip__size' });
		box.hidden = true;
		size.hidden = true;
		['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].forEach(function (dir) {
			var handle = element('div', { className: 'stillframe-snip__handle' });
			handle.setAttribute('data-h', dir);
			box.appendChild(handle);
		});
		var actions = element('div', { className: 'stillframe-snip__actions', role: 'toolbar' });
		var dims = element('span', { className: 'stillframe-snip__dims' });
		var actionsSep = element('span', { className: 'stillframe-snip__actions-sep' });
		actionsSep.setAttribute('aria-hidden', 'true');
		var resetButton = element('button', {
			type: 'button',
			className: 'stillframe-snip__reset',
			'aria-label': (text('cancel') || 'Cancel') + ' (Esc)',
			title: (text('cancel') || 'Cancel') + ' (Esc)'
		});
		resetButton.appendChild(iconSvg('close', 15));

		var goButton = element('button', {
			type: 'button',
			className: 'stillframe-snip__go',
			'aria-label': (text('capture') || 'Capture') + ' (Enter)',
			title: (text('capture') || 'Capture') + ' (Enter)'
		});
		goButton.appendChild(iconSvg('check', 15));
		goButton.appendChild(element('span', { text: text('capture') || 'Capture' }));

		actions.hidden = true;
		actions.appendChild(dims);
		actions.appendChild(actionsSep);
		actions.appendChild(resetButton);
		actions.appendChild(goButton);
		var sel = null;
		var adj = null;
		var adjFrame = 0;

		var bar = element('div', { className: 'stillframe-snip__bar', role: 'toolbar', 'aria-label': text('heading') || 'Capture this screen' });
		var hint = element('div', { className: 'stillframe-snip__hint', role: 'status' });
		var mode = 'rect';
		var rectButton = iconButton('area', text('snipRect') || 'Area', '', true);
		var windowModeButton = iconButton('window', text('snipWindow') || 'Window', '', true);
		var fullButton = iconButton('full', text('snipFull') || 'Full screen', '', true);
		var sep = element('span', { className: 'stillframe-snip__sep' });
		sep.setAttribute('aria-hidden', 'true');
		var cancelButton = iconButton('close', text('cancel') || 'Close', 'stillframe-snip__close', false, (text('cancel') || 'Close') + ' (Esc)');
		[rectButton, windowModeButton, fullButton].forEach(function (button) {
			button.classList.add('stillframe-snip__mode');
		});

		function setHint() {
			hint.textContent = mode === 'window'
				? (text('snipHintWindow') || 'Click a section of the page to capture it')
				: (text('snipHint') || 'Drag to select an area');
		}

		function setMode(next) {
			sel = null;
			adj = null;
			mode = next;
			root.setAttribute('data-mode', next);
			rectButton.setAttribute('aria-pressed', next === 'rect' ? 'true' : 'false');
			windowModeButton.setAttribute('aria-pressed', next === 'window' ? 'true' : 'false');
			fullButton.setAttribute('aria-pressed', 'false');
			if (devMenu) {
				devMenu.hidden = true;
				devButton.setAttribute('aria-expanded', 'false');
				root.classList.remove('has-menu-open');
			}
			showSelection(null);
			setHint();
		}

		function stopBar(event) {
			event.stopPropagation();
			touch();
		}

		rectButton.setAttribute('aria-pressed', 'true');
		windowModeButton.setAttribute('aria-pressed', 'false');
		fullButton.setAttribute('aria-pressed', 'false');
		rectButton.addEventListener('click', function (event) {
			stopBar(event);
			if (!snipBusy) {
				setMode('rect');
			}
		});
		windowModeButton.addEventListener('click', function (event) {
			stopBar(event);
			if (!snipBusy) {
				setMode('window');
			}
		});
		fullButton.addEventListener('click', function (event) {
			stopBar(event);
			if (snipBusy) {
				return;
			}
			var sizeNow = viewSize();
			closeAllMenus();
			mode = 'rect';
			root.setAttribute('data-mode', 'rect');
			rectButton.setAttribute('aria-pressed', 'false');
			windowModeButton.setAttribute('aria-pressed', 'false');
			fullButton.setAttribute('aria-pressed', 'true');
			sel = { x: 0, y: 0, width: sizeNow.width, height: sizeNow.height };
			showSelection(sel);
			scheduleShot(IDLE_BEFORE_RENDER_MS);
		});

		function closeAllMenus() {
			if (devMenu && !devMenu.hidden) {
				devMenu.hidden = true;
				devButton.setAttribute('aria-expanded', 'false');
			}
			if (directMenu && !directMenu.hidden) {
				directMenu.hidden = true;
				directButton.setAttribute('aria-expanded', 'false');
			}
			if (recentMenu && !recentMenu.hidden) {
				recentMenu.hidden = true;
				recentButton.setAttribute('aria-expanded', 'false');
			}
			root.classList.remove('has-menu-open');
			if (!sel) {
				hint.hidden = false;
				hint.style.display = '';
			}
		}

		// --- Section A: Devices Button & Menu (Only Framed Viewports!) ---
		var devWrap = element('div', { className: 'stillframe-snip__devices-wrap' });
		var devButton = iconButton('devices', tr('options', 'Options'), 'stillframe-snip__mode', true);
		var devChevron = iconSvg('chevronDown', 11);
		devChevron.classList.add('stillframe-snip__chevron');
		devButton.appendChild(devChevron);

		var devMenu = element('div', { className: 'stillframe-snip__devices-menu' });
		devMenu.hidden = true;

		var sec1Title = element('div', { className: 'stillframe-hub-sec-title', text: 'Frame on Screen' });
		var sec1Grid = element('div', { className: 'stillframe-hub-presets-grid' });

		var devPresets = [
			{ id: 'desktop', width: 1440, height: 900, label: 'Desktop', badge: '1440px', icon: 'desktop' },
			{ id: 'tablet', width: 834, height: 1112, label: 'iPad', badge: '834px', icon: 'tablet' },
			{ id: 'mobile', width: 390, height: 844, label: 'Mobile', badge: '390px', icon: 'mobile' }
		];

		devPresets.forEach(function (d) {
			var devItem = element('button', {
				type: 'button',
				className: 'stillframe-hub-preset-btn',
				title: 'Frame screen at ' + d.label + ' (' + d.width + ' × ' + d.height + ')'
			});
			devItem.appendChild(iconSvg(d.icon, 16));
			devItem.appendChild(element('span', { className: 'stillframe-hub-preset-label', text: d.label }));
			devItem.appendChild(element('span', { className: 'stillframe-hub-preset-badge', text: d.badge }));
			devItem.addEventListener('click', function (e) {
				stopBar(e);
				closeAllMenus();
				hint.hidden = true;
				hint.style.display = 'none';

				var winW = window.innerWidth || document.documentElement.clientWidth || 1024;
				var winH = window.innerHeight || document.documentElement.clientHeight || 768;
				var targetW = Math.min(d.width, Math.max(200, winW - 32));
				var targetH = Math.min(d.height, Math.max(200, winH - 120));
				var targetX = Math.max(16, Math.round((winW - targetW) / 2));
				var targetY = Math.max(64, Math.round((winH - targetH) / 2));

				sel = {
					x: targetX,
					y: targetY,
					width: targetW,
					height: targetH
				};
				mode = 'rect';
				root.setAttribute('data-mode', 'rect');
				rectButton.setAttribute('aria-pressed', 'true');
				windowModeButton.setAttribute('aria-pressed', 'false');
				fullButton.setAttribute('aria-pressed', 'false');
				showSelection(sel);
				scheduleShot(IDLE_BEFORE_RENDER_MS);
			});
			sec1Grid.appendChild(devItem);
		});


		var engineLabel = element('label', { className: 'stillframe-hub-toggle sfd-engine' });
		var engineCb = element('input', { type: 'checkbox', className: 'stillframe-hub-toggle__input' });
		engineCb.checked = exactPref();
		engineCb.addEventListener('change', function () {
			setExactPref(engineCb.checked);
		});
		var engineText = element('span', { className: 'sfd-engine__text' });
		engineText.appendChild(element('b', { text: tr('engineTitle', 'Pixel-perfect capture') }));
		engineText.appendChild(element('small', { text: tr('engineHelp', 'Your browser asks to share this tab, so the screenshot matches the screen exactly. Nothing is uploaded.') }));
		engineLabel.appendChild(engineCb);
		engineLabel.appendChild(element('span', { className: 'stillframe-hub-toggle__track' }));
		engineLabel.appendChild(engineText);
		devMenu.appendChild(engineLabel);

		function toggleMenu(menu, button, onOpen) {
			var wasOpen = !menu.hidden;
			closeAllMenus();
			if (!wasOpen) {
				if (sel || box.classList.contains('is-adjusting') || !box.hidden) {
					// A dropdown starts a new choice, so any leftover selection goes away.
					clearSelection();
					fullButton.setAttribute('aria-pressed', 'false');
					rectButton.setAttribute('aria-pressed', mode === 'rect' ? 'true' : 'false');
				}
				menu.hidden = false;
				button.setAttribute('aria-expanded', 'true');
				root.classList.add('has-menu-open');
				hint.hidden = true;
				hint.style.display = 'none';
				if (onOpen) onOpen();
			}
		}

		devButton.addEventListener('click', function (event) {
			stopBar(event);
			toggleMenu(devMenu, devButton);
		});

		devWrap.appendChild(devButton);
		devWrap.appendChild(devMenu);

		// --- Section B: Direct Page Button & Menu ---
		var directWrap = element('div', { className: 'stillframe-snip__direct-wrap' });
		var directButton = iconButton('page', text('directPage') || 'Direct Page', 'stillframe-snip__mode', true);
		var directChevron = iconSvg('chevronDown', 11);
		directChevron.classList.add('stillframe-snip__chevron');
		directButton.appendChild(directChevron);

		var directMenu = element('div', { className: 'stillframe-snip__direct-menu' });
		directMenu.hidden = true;

		var directTitle = element('div', { className: 'stillframe-hub-sec-title', text: tr('directTitle', 'Capture a page') });

		// Page
		var isAdmin = window.location.pathname.indexOf('/wp-admin') !== -1;
		var curPath = window.location.pathname;

		function sfdRow(label, control) {
			var row = element('div', { className: 'sfd-row' });
			row.appendChild(element('span', { className: 'sfd-label', text: label }));
			row.appendChild(control);
			return row;
		}

		var hubPicker = createPagePicker({
			pages: config && config.sitePages,
			homeUrl: (config && config.homeUrl) || '',
			includeCurrent: true,
			currentLabel: (isAdmin ? tr('currentAdmin', 'Current Admin Screen') : tr('currentScreen', 'Current Screen')) + ' (' + (curPath.length > 24 ? curPath.slice(0, 22) + '...' : curPath) + ')',
			onEscape: function () {
				closeAllMenus();
				directButton.focus();
			}
		});

		// Devices: three compact toggles.
		var availableDevices = [
			{ id: 'desktop', label: 'Desktop', width: 1440, estHeight: 900, icon: 'desktop' },
			{ id: 'tablet', label: 'iPad', width: 834, estHeight: 1112, icon: 'tablet' },
			{ id: 'mobile', label: 'Mobile', width: 390, estHeight: 844, icon: 'mobile' }
		];
		var devCards = {};
		var hubDevBox = element('div', { className: 'sfd-chips', role: 'group', 'aria-label': tr('selectDevices', 'Devices') });
		var hubError = element('p', { className: 'sfd-error', role: 'alert' });

		function selectedDevices() {
			return availableDevices.filter(function (d) {
				return devCards[d.id].classList.contains('is-selected');
			});
		}

		availableDevices.forEach(function (d) {
			var chip = element('button', {
				type: 'button',
				className: 'sfd-chip is-selected',
				'aria-pressed': 'true',
				title: tr('dev_' + d.id, d.label) + ' (' + d.width + 'px)',
				'aria-label': tr('dev_' + d.id, d.label) + ' (' + d.width + 'px)'
			});
			chip.appendChild(iconSvg(d.icon, 17));
			chip.addEventListener('click', function (e) {
				stopBar(e);
				hubError.textContent = '';
				var on = chip.classList.contains('is-selected');
				chip.classList.toggle('is-selected', !on);
				chip.setAttribute('aria-pressed', on ? 'false' : 'true');
				updateSubmitLabel();
			});
			devCards[d.id] = chip;
			hubDevBox.appendChild(chip);
		});

		// Segmented choice with one active option.
		function makeSeg(options, initial, onPick) {
			var box = element('div', { className: 'sfd-seg', role: 'group' });
			options.forEach(function (opt) {
				var btn = element('button', {
					type: 'button',
					className: 'sfd-seg__btn' + (opt.value === initial ? ' is-active' : ''),
					'aria-pressed': opt.value === initial ? 'true' : 'false',
					text: opt.label,
					title: opt.title || ''
				});
				btn.addEventListener('click', function (e) {
					stopBar(e);
					Array.prototype.forEach.call(box.children, function (other) {
						var on = other === btn;
						other.classList.toggle('is-active', on);
						other.setAttribute('aria-pressed', on ? 'true' : 'false');
					});
					onPick(opt.value);
				});
				box.appendChild(btn);
			});
			return box;
		}

		var RES_HELP = {
			'1': tr('res1Help', 'Same pixels as the screen. Smallest files.'),
			'2': tr('res2Help', 'Sharp on high-density displays. Recommended.'),
			'3': tr('res3Help', 'Maximum detail. Large files; very long pages may be reduced.')
		};
		var HEIGHT_HELP = {
			viewport: tr('heightViewportHelp', 'Only the first screen (above the fold).'),
			fullpage: tr('heightFullHelp', 'The entire page, top to bottom.')
		};
		var hubResSelected = '2';
		var hubHeightSelected = 'viewport';
		var hubHelp = element('p', { className: 'sfd-help' });

		function updateHelp() {
			hubHelp.textContent = RES_HELP[hubResSelected] + ' ' + HEIGHT_HELP[hubHeightSelected];
		}

		var hubResSeg = makeSeg([
			{ value: '1', label: '1x', title: RES_HELP['1'] },
			{ value: '2', label: '2x', title: RES_HELP['2'] },
			{ value: '3', label: '3x', title: RES_HELP['3'] }
		], '2', function (value) {
			hubResSelected = value;
			updateHelp();
		});
		var hubHeightSeg = makeSeg([
			{ value: 'viewport', label: tr('heightViewport', 'First screen'), title: HEIGHT_HELP.viewport },
			{ value: 'fullpage', label: tr('heightFull', 'Full page'), title: HEIGHT_HELP.fullpage }
		], 'viewport', function (value) {
			hubHeightSelected = value;
			updateHelp();
		});
		updateHelp();

		// Admin bar option
		var hubAdminLabel = element('label', { className: 'stillframe-hub-toggle' });
		var hubAdminCb = element('input', { type: 'checkbox', className: 'stillframe-hub-toggle__input' });
		hubAdminCb.checked = true;
		hubAdminLabel.appendChild(hubAdminCb);
		hubAdminLabel.appendChild(element('span', { className: 'stillframe-hub-toggle__track' }));
		hubAdminLabel.appendChild(element('span', { text: tr('hideAdminBar', 'Hide the admin bar in the screenshot') }));

		var hubSubmit = element('button', { type: 'button', className: 'sfd-submit' });
		hubSubmit.appendChild(iconSvg('camera', 15));
		var hubSubmitText = element('span', { text: tr('captureAll', 'Capture 3 devices') });
		hubSubmit.appendChild(hubSubmitText);

		function updateSubmitLabel() {
			var selected = selectedDevices();
			if (!selected.length) {
				hubSubmitText.textContent = tr('captureNone', 'Capture');
			} else if (selected.length === 1) {
				hubSubmitText.textContent = tr('captureOne', 'Capture %s').replace('%s', selected[0].label);
			} else {
				hubSubmitText.textContent = tr('captureN', 'Capture %d devices').replace('%d', String(selected.length));
			}
		}

		hubSubmit.addEventListener('click', function (e) {
			stopBar(e);
			var targetUrl = hubPicker.getValue();
			if (targetUrl === '__current__') {
				targetUrl = captureTargetUrl();
			} else if (!targetUrl) {
				hubPicker.focusCustom();
				return;
			}

			var selected = selectedDevices();
			if (!selected.length) {
				hubError.textContent = tr('chooseDevice', 'Choose at least one device to capture.');
				return;
			}

			var targetScale = parseInt(hubResSelected, 10) || 2;
			var hideAdmin = hubAdminCb.checked;
			var isFullPage = hubHeightSelected === 'fullpage';

			destroySnip();
			openMultiDirectCapture(targetUrl, selected, targetScale, hideAdmin, isFullPage);
		});

		var hubFooter = element('div', { className: 'sfd-foot' });
		hubFooter.appendChild(hubSubmit);

		directMenu.appendChild(directTitle);
		directMenu.appendChild(sfdRow(tr('targetPage', 'Page'), hubPicker.root));
		directMenu.appendChild(sfdRow(tr('selectDevices', 'Devices'), hubDevBox));
		directMenu.appendChild(hubError);
		directMenu.appendChild(sfdRow(tr('resQuality', 'Quality'), hubResSeg));
		directMenu.appendChild(sfdRow(tr('captureHeight', 'Height'), hubHeightSeg));
		directMenu.appendChild(hubAdminLabel);
		directMenu.appendChild(hubFooter);

		directButton.addEventListener('click', function (event) {
			stopBar(event);
			toggleMenu(directMenu, directButton);
		});

		directWrap.appendChild(directButton);
		directWrap.appendChild(directMenu);

		// --- Section C: Recent Screenshots Button & Menu ---
		var recentWrap = element('div', { className: 'stillframe-snip__recent-wrap' });
		var recentButton = iconButton('recent', text('recent') || 'Recent', 'stillframe-snip__mode', true);
		var recentChevron = iconSvg('chevronDown', 11);
		recentChevron.classList.add('stillframe-snip__chevron');
		recentButton.appendChild(recentChevron);

		var recentMenu = element('div', { className: 'stillframe-snip__recent-menu' });
		recentMenu.hidden = true;

		var recentHead = element('div', { className: 'stillframe-hub-sec-title', text: 'Recent Screenshots' });
		var recentBody = element('div', { className: 'stillframe-recent-menu-body' });
		recentMenu.appendChild(recentHead);
		recentMenu.appendChild(recentBody);

		recentButton.addEventListener('click', function (event) {
			stopBar(event);
			toggleMenu(recentMenu, recentButton, function () {
				renderRecentList(recentBody, function (item) {
					destroySnip();
					openRecentCaptureInEditor(item);
				});
			});
		});

		recentWrap.appendChild(recentButton);
		recentWrap.appendChild(recentMenu);

		function onDocPointerDown(event) {
			if (
				(devWrap && devWrap.contains(event.target)) ||
				(directWrap && directWrap.contains(event.target)) ||
				(recentWrap && recentWrap.contains(event.target))
			) {
				return;
			}
			closeAllMenus();
		}
		document.addEventListener('pointerdown', onDocPointerDown, true);

		cancelButton.addEventListener('click', function (event) {
			stopBar(event);
			cancelSnip();
		});
		bar.addEventListener('pointerdown', stopBar);
		hint.addEventListener('pointerdown', stopBar);
		bar.appendChild(rectButton);
		bar.appendChild(windowModeButton);
		bar.appendChild(fullButton);
		bar.appendChild(directWrap);
		bar.appendChild(recentWrap);
		bar.appendChild(sep);
		bar.appendChild(cancelButton);
		setHint();

		root.appendChild(shade);
		root.appendChild(box);
		root.appendChild(size);
		root.appendChild(actions);
		root.appendChild(bar);
		root.appendChild(hint);
		if (document.getElementById('wpadminbar')) {
			root.classList.add('has-admin-bar');
		}
		document.body.appendChild(root);
		lockScroll();
		snip = root;

		var drag = null;
		var moveEvent = null;
		var moveFrame = 0;
		var hoverFrame = 0;
		var restartTimer = 0;
		var lastActivity = Date.now();

		function touch() {
			lastActivity = Date.now();
		}

		// Any click, key or pointer movement in the overlay counts as activity, so the
		// heavy background render never starts in the middle of fast interaction.
		['pointerdown', 'pointermove', 'keydown'].forEach(function (type) {
			root.addEventListener(type, touch, true);
		});

		// Rendering the page is heavy main-thread work. Only start it when the
		// pointer has been idle, so it never competes with a drag or a mode switch.
		function scheduleShot(delay) {
			window.clearTimeout(restartTimer);
			if (!canPrerender()) {
				return;
			}
			restartTimer = window.setTimeout(function () {
				if (!snip || snipBusy || viewShot.canvas || viewShot.work) {
					return;
				}
				if (drag || root.classList.contains('has-menu-open') || Date.now() - lastActivity < IDLE_BEFORE_RENDER_MS) {
					scheduleShot(300);
					return;
				}
				startViewShot().catch(function () {
					return null;
				});
			}, delay);
		}

		function positionActions(rect) {
			var width = actions.offsetWidth || 180;
			var height = actions.offsetHeight || 38;
			var top;
			var barBottom = bar.getBoundingClientRect().bottom + 8;
			if (rect.y + rect.height + height + 12 <= window.innerHeight) {
				// Fits below the selection.
				top = rect.y + rect.height + 8;
			} else if (rect.y - height - 8 >= barBottom) {
				// No room below, so sit just above it, clear of the top bar.
				top = rect.y - height - 8;
			} else {
				// Tall selection: tuck inside the bottom edge.
				top = Math.max(barBottom, rect.y + rect.height - height - 12);
			}
			// Center horizontally relative to the selection box, constrained within viewport
			var left = Math.max(16, Math.min(window.innerWidth - width - 16, rect.x + Math.round((rect.width - width) / 2)));
			actions.style.transform = 'translate3d(' + left + 'px,' + top + 'px,0)';
		}

		function showSelection(rect) {
			if (!rect || rect.width < 1 || rect.height < 1) {
				box.hidden = true;
				size.hidden = true;
				size.style.display = 'none';
				actions.hidden = true;
				actions.style.display = 'none';
				box.classList.remove('is-adjusting', 'is-small');
				root.classList.remove('is-under-bar');
				hint.hidden = false;
				root.classList.remove('is-selecting');
				return;
			}
			box.hidden = false;
			box.classList.toggle('is-adjusting', !!sel);
			// Tiny boxes get tiny handles, so they do not swallow the selection.
			box.classList.toggle('is-small', rect.width < 90 || rect.height < 90);
			// A selection parked under the top bar would hide its own handles, so
			// the bar steps back (and the box rises above it) until it moves away.
			var barBottomNow = bar.getBoundingClientRect().bottom;
			root.classList.toggle('is-under-bar', rect.y < barBottomNow && rect.y + rect.height < barBottomNow + 120);
			hint.hidden = true;
			root.classList.add('is-selecting');
			box.style.transform = 'translate3d(' + rect.x + 'px,' + rect.y + 'px,0)';
			box.style.width = rect.width + 'px';
			box.style.height = rect.height + 'px';
			var label = Math.round(rect.width).toLocaleString() + ' × ' + Math.round(rect.height).toLocaleString();
			if (sel) {
				size.hidden = true;
				size.style.display = 'none';
				actions.hidden = false;
				actions.style.display = 'flex';
				dims.textContent = label;
				positionActions(rect);
				return;
			}
			actions.hidden = true;
			actions.style.display = 'none';
			size.hidden = false;
			size.style.display = 'inline-flex';
			size.textContent = label;
			var top = rect.y + rect.height + 8;
			if (top > window.innerHeight - 32) {
				top = Math.max(8, rect.y - 32);
			}
			var left = Math.min(Math.max(8, rect.x + (rect.width - 90) / 2), Math.max(8, window.innerWidth - 100));
			size.style.transform = 'translate3d(' + left + 'px,' + top + 'px,0)';
		}

		function pickWindow(clientX, clientY) {
			var stack = document.elementsFromPoint(clientX, clientY) || [];
			var node = null;
			var i;
			for (i = 0; i < stack.length; i++) {
				if (root.contains(stack[i])) {
					continue;
				}
				node = stack[i];
				break;
			}
			if (!node || node === document.documentElement) {
				return document.body;
			}
			var best = node;
			while (node && node !== document.documentElement) {
				var r = node.getBoundingClientRect();
				if (r.width >= 80 && r.height >= 40) {
					best = node;
					break;
				}
				if (node === document.body) {
					break;
				}
				node = node.parentElement;
			}
			return best;
		}

		function rectFromNode(node) {
			var r = node.getBoundingClientRect();
			return {
				x: r.left,
				y: r.top,
				width: r.width,
				height: r.height
			};
		}

		shade.addEventListener('pointerdown', function (event) {
			touch();
			closeAllMenus();
			if (snipBusy || event.button !== 0) {
				return;
			}
			event.preventDefault();
			if (mode === 'window') {
				var targetRect = rectFromNode(pickWindow(event.clientX, event.clientY));
				if (targetRect && targetRect.width >= 8 && targetRect.height >= 8) {
					sel = targetRect;
					showSelection(sel);
					scheduleShot(IDLE_BEFORE_RENDER_MS);
				}
				return;
			}
			sel = null;
			shade.setPointerCapture(event.pointerId);
			drag = {
				id: event.pointerId,
				x: event.clientX,
				y: event.clientY
			};
			showSelection(normalizeRect(drag.x, drag.y, event.clientX, event.clientY));
		});
		shade.addEventListener('pointermove', function (event) {
			touch();
			if (mode === 'window' && !drag && !snipBusy && !sel) {
				moveEvent = event;
				if (hoverFrame) {
					return;
				}
				hoverFrame = window.requestAnimationFrame(function () {
					hoverFrame = 0;
					if (mode !== 'window' || drag || snipBusy || !moveEvent || sel) {
						return;
					}
					showSelection(rectFromNode(pickWindow(moveEvent.clientX, moveEvent.clientY)));
				});
				return;
			}
			if (!drag || drag.id !== event.pointerId) {
				return;
			}
			moveEvent = event;
			if (moveFrame) {
				return;
			}
			moveFrame = window.requestAnimationFrame(function () {
				moveFrame = 0;
				if (!drag || !moveEvent) {
					return;
				}
				showSelection(normalizeRect(drag.x, drag.y, moveEvent.clientX, moveEvent.clientY));
			});
		});
		shade.addEventListener('pointerup', function (event) {
			if (!drag || drag.id !== event.pointerId) {
				return;
			}
			var rect = normalizeRect(drag.x, drag.y, event.clientX, event.clientY);
			drag = null;
			moveEvent = null;
			if (rect.width < 8 || rect.height < 8) {
				showSelection(null);
				return;
			}
			// Keep the selection so it can be moved or resized before capturing.
			sel = rect;
			showSelection(sel);
			scheduleShot(IDLE_BEFORE_RENDER_MS);
		});

		function clearSelection() {
			sel = null;
			adj = null;
			showSelection(null);
		}

		function applyAdjust(dx, dy) {
			var o = adj.orig;
			var view = viewSize();
			var min = 8;
			var l = o.x;
			var t = o.y;
			var r = o.x + o.width;
			var b = o.y + o.height;
			var dir = adj.dir;
			if (dir === 'move') {
				dx = Math.max(-l, Math.min(dx, view.width - r));
				dy = Math.max(-t, Math.min(dy, view.height - b));
				l += dx;
				r += dx;
				t += dy;
				b += dy;
			} else {
				if (dir.indexOf('w') > -1) {
					l = Math.max(0, Math.min(o.x + dx, r - min));
				}
				if (dir.indexOf('e') > -1) {
					r = Math.min(view.width, Math.max(o.x + o.width + dx, l + min));
				}
				if (dir.indexOf('n') > -1) {
					t = Math.max(0, Math.min(o.y + dy, b - min));
				}
				if (dir.indexOf('s') > -1) {
					b = Math.min(view.height, Math.max(o.y + o.height + dy, t + min));
				}
			}
			sel = { x: l, y: t, width: r - l, height: b - t };
			showSelection(sel);
		}

		box.addEventListener('pointerdown', function (event) {
			if (!sel || snipBusy || event.button !== 0) {
				return;
			}
			touch();
			closeAllMenus();
			event.preventDefault();
			event.stopPropagation();
			var handle = event.target && event.target.getAttribute ? event.target.getAttribute('data-h') : null;
			box.setPointerCapture(event.pointerId);
			adj = {
				id: event.pointerId,
				dir: handle || 'move',
				x: event.clientX,
				y: event.clientY,
				orig: { x: sel.x, y: sel.y, width: sel.width, height: sel.height }
			};
		});
		box.addEventListener('pointermove', function (event) {
			if (!adj || adj.id !== event.pointerId) {
				return;
			}
			touch();
			moveEvent = event;
			if (adjFrame) {
				return;
			}
			adjFrame = window.requestAnimationFrame(function () {
				adjFrame = 0;
				if (adj && moveEvent) {
					applyAdjust(moveEvent.clientX - adj.x, moveEvent.clientY - adj.y);
				}
			});
		});
		function endAdjust(event) {
			if (adj && adj.id === event.pointerId) {
				adj = null;
				moveEvent = null;
				scheduleShot(IDLE_BEFORE_RENDER_MS);
			}
		}
		box.addEventListener('pointerup', endAdjust);
		box.addEventListener('pointercancel', endAdjust);
		goButton.addEventListener('click', function (event) {
			stopBar(event);
			if (sel && !snipBusy) {
				captureRect(sel);
			}
		});
		resetButton.addEventListener('click', function (event) {
			stopBar(event);
			clearSelection();
		});
		actions.addEventListener('pointerdown', stopBar);
		shade.addEventListener('pointercancel', function (event) {
			if (!drag || drag.id !== event.pointerId) {
				return;
			}
			drag = null;
			moveEvent = null;
			showSelection(null);
		});

		snipKeyHandler = function (event) {
			if (!snip) {
				return;
			}
			if (event.target && event.target.closest && event.target.closest('.sfp')) {
				return;
			}
			if ((event.ctrlKey || event.metaKey) && (event.key === 'a' || event.key === 'A') && !/^(INPUT|TEXTAREA|SELECT)$/.test((event.target && event.target.tagName) || '')) {
				event.preventDefault();
				return;
			}
			if (event.key === 'Enter' && sel && !snipBusy) {
				event.preventDefault();
				event.stopPropagation();
				captureRect(sel);
				return;
			}
			if (event.key !== 'Escape') {
				return;
			}
			event.preventDefault();
			event.stopPropagation();
			if (sel) {
				clearSelection();
				return;
			}
			cancelSnip();
		};
		document.addEventListener('keydown', snipKeyHandler, true);

		function onViewChange() {
			invalidateViewShot();
			scheduleShot(300);
		}
		window.addEventListener('scroll', onViewChange, true);
		window.addEventListener('resize', onViewChange);
		snipCleanup = function () {
			window.clearTimeout(restartTimer);
			window.removeEventListener('scroll', onViewChange, true);
			window.removeEventListener('resize', onViewChange);
			document.removeEventListener('pointerdown', onDocPointerDown, true);
		};

		// Render the page in the background while the user chooses, so the
		// selection can be cropped from a ready image the moment they let go.
		scheduleShot(IDLE_BEFORE_RENDER_MS);
	}

	function captureInFrame(url, width, scale, isCancelled, options) {
		options = options || {};
		return new Promise(function (resolve, reject) {
			var local = element('iframe', {
				className: 'stillframe-capture-frame',
				title: text('frameTitle'),
				'aria-hidden': 'true'
			});
			local.tabIndex = -1;
			local.style.position = 'fixed';
			local.style.left = '-99999px';
			local.style.top = '0';
			local.style.width = width + 'px';
			local.style.height = '100vh';
			local.style.border = '0';
			local.style.opacity = '1';
			local.style.pointerEvents = 'none';
			local.style.zIndex = '0';
			frame = local;

			var settled = false;
			var shooting = false;
			var timer = 0;
			var blankTimer = 0;

			function stopTimer() {
				if (timer) {
					window.clearTimeout(timer);
					timer = 0;
				}
				if (blankTimer) {
					window.clearTimeout(blankTimer);
					blankTimer = 0;
				}
			}

			function finish(error, blob) {
				if (settled) {
					return;
				}
				settled = true;
				stopTimer();
				removeFrame();
				if (error) {
					reject(error);
					return;
				}
				resolve(blob);
			}

			function armTimeout(ms) {
				stopTimer();
				timer = window.setTimeout(function () {
					var error = new Error('timeout');
					error.code = 'timeout';
					finish(error);
				}, ms);
			}

			armTimeout(12000);
			local.addEventListener('load', function () {
				if (document.activeElement === local && dialog) {
					dialog.focus();
				}
				if (settled) {
					return;
				}
				if (isCancelled()) {
					var cancelled = new Error('cancelled');
					cancelled.code = 'cancelled';
					finish(cancelled);
					return;
				}
				var state = frameState(local);
				if (state === 'blank') {
					if (!blankTimer) {
						blankTimer = window.setTimeout(function () {
							blankTimer = 0;
							if (settled || shooting) {
								return;
							}
							if (frameState(local) === 'ready') {
								return;
							}
							var blankBlocked = new Error('blocked');
							blankBlocked.code = 'blocked';
							finish(blankBlocked);
						}, 2000);
					}
					return;
				}
				if (blankTimer) {
					window.clearTimeout(blankTimer);
					blankTimer = 0;
				}
				if (state === 'blocked') {
					var blocked = new Error('blocked');
					blocked.code = 'blocked';
					finish(blocked);
					return;
				}
				if (shooting) {
					return;
				}
				shooting = true;
				armTimeout(20000);
				try {
					prepareAndShoot(local, scale, options).then(function (blob) {
						if (isCancelled()) {
							var cancelledLater = new Error('cancelled');
							cancelledLater.code = 'cancelled';
							finish(cancelledLater);
							return;
						}
						finish(null, blob);
					}, function (error) {
						if (isBlockedError(error)) {
							error.code = 'blocked';
						} else if (!error.code) {
							error.code = 'failed';
						}
						finish(error);
					});
				} catch (error) {
					if (isBlockedError(error)) {
						error.code = 'blocked';
					} else if (!error.code) {
						error.code = 'failed';
					}
					finish(error);
				}
			});

			local.src = url;
			document.body.appendChild(local);
		});
	}

	function reportFailure(error) {
		removeFrame();
		setBusy(false);
		if (!panel) {
			return;
		}
		if (error && error.code === 'cancelled') {
			return;
		}
		if (error && error.code === 'blocked') {
			setStatus(text('frameBlocked'));
			var screen = panel.querySelector('.stillframe-width-screen');
			if (screen) {
				Array.prototype.forEach.call(panel.querySelectorAll('.stillframe-width-preset'), function (item) {
					item.setAttribute('aria-pressed', 'false');
				});
				screen.setAttribute('aria-pressed', 'true');
				screen.focus();
			}
			return;
		}
		if (error && error.code === 'timeout') {
			setStatus(text('captureTimeout'));
			return;
		}
		if (error && error.code === 'library') {
			setStatus(text('libraryMissing'));
			return;
		}
		setStatus(text('captureFailed'));
	}

	function startCapture(mode, widthOverride) {
		var token = session;
		var scale = readScale();
		var width = parseInt(widthOverride, 10);
		if (!width || width < 1) {
			width = 0;
		}
		if (mode !== 'window' && !width && isScreenMode()) {
			mode = 'window';
		}
		if (!width) {
			width = mode === 'window'
				? Math.max(1, Math.round(document.documentElement.clientWidth || window.innerWidth || 1))
				: readWidth();
		}
		if (mode !== 'window' && !width) {
			setStatus(text('invalidWidth'));
			if (customInput && customButton && customButton.getAttribute('aria-pressed') === 'true') {
				customInput.focus();
			}
			return;
		}
		if (windowButton && mode !== 'window') {
			windowButton.hidden = true;
		}
		setBusy(true);
		setStatus(mode === 'window' ? text('capturing') : text('capturingWidth'));
		var sourceUrl = mode === 'window' ? window.location.href : captureTargetUrl();
		var work;
		if (mode === 'window') {
			var viewW = Math.max(1, Math.round(document.documentElement.clientWidth || window.innerWidth || width || 1));
			var viewH = Math.max(1, Math.round(document.documentElement.clientHeight || window.innerHeight || 1));
			width = viewW;
			removeFrame();
			var restoreWindow = applyScene(document, readPrefs());
			work = shoot(document.documentElement, scale, {
				width: viewW,
				height: viewH,
				crop: { x: 0, y: 0, width: viewW, height: viewH }
			}, window).then(function (blob) {
				restoreWindow();
				return blob;
			}, function (error) {
				restoreWindow();
				throw error;
			});
		} else {
			work = captureInFrame(sourceUrl, width, scale, function () {
				return token !== session;
			});
		}
		work.then(function (blob) {
			if (token !== session || !panel) {
				return;
			}
			showImage(blob, width, scale, sourceUrl);
		}).catch(function (error) {
			if (token !== session) {
				removeFrame();
				return;
			}
			reportFailure(error);
		});
	}

	function onKeydown(event) {
		if (!panel) {
			return;
		}
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			api.closePanel();
			return;
		}
		if ((event.ctrlKey || event.metaKey) && (event.key === 'z' || event.key === 'Z') && !event.shiftKey) {
			if (event.target && event.target.tagName === 'INPUT') {
				return;
			}
			if (editor) {
				event.preventDefault();
				editor.undo();
			}
			return;
		}
	}

	function onFocusIn(event) {
		if (!dialog || dialog.contains(event.target)) {
			return;
		}
		var nodes = focusable();
		(nodes[0] || dialog).focus();
	}

	function saveToMedia() {
		if (!editor || !captured || !config.canUpload || !config.ajaxUrl || !config.mediaNonce) {
			setStatus(text('mediaFailed'));
			return;
		}
		if (mediaButton) {
			mediaButton.disabled = true;
		}
		setStatus(text('savingMedia'), '', '', 'busy');
		exportBlob().then(function (pngBlob) {
			return exportAs(pngBlob, fileNameFor(captured.url, captured.width, captured.scale));
		}).then(function (out) {
			var blob = out.blob;
			var body = new FormData();
			body.append('action', 'stillframe_save_media');
			body.append('nonce', String(config.mediaNonce));
			body.append('image', blob, out.name);
			return window.fetch(String(config.ajaxUrl), {
				method: 'POST',
				credentials: 'same-origin',
				body: body
			}).then(function (response) {
				return response.json().then(function (payload) {
					return {
						ok: response.ok,
						payload: payload
					};
				});
			});
		}).then(function (result) {
			if (!panel) {
				return;
			}
			if (mediaButton) {
				mediaButton.disabled = false;
			}
			var data = result && result.payload && result.payload.data ? result.payload.data : null;
			if (!result || !result.ok || !result.payload || !result.payload.success) {
				setStatus(text('mediaFailed'), '', '', 'error');
				return;
			}
			setStatus(text('savedMedia'), data && data.editUrl ? String(data.editUrl) : '', text('viewMedia'), 'success');
		}).catch(function () {
			if (!panel) {
				return;
			}
			if (mediaButton) {
				mediaButton.disabled = false;
			}
			setStatus(text('mediaFailed'), '', '', 'error');
		});
	}

	function selectWidthButton(button) {
		var screen = panel.querySelector('.stillframe-width-screen');
		if (screen) {
			screen.setAttribute('aria-pressed', 'false');
		}
		Array.prototype.forEach.call(panel.querySelectorAll('.stillframe-width-preset'), function (item) {
			item.setAttribute('aria-pressed', item === button ? 'true' : 'false');
		});
		if (customButton) {
			customButton.setAttribute('aria-pressed', 'false');
		}
		if (customInput) {
			customInput.disabled = true;
		}
	}

	function buildPanel(compact) {
		compactPanel = !!compact;
		var root = element('div', { className: compactPanel ? 'stillframe-capture-panel is-compact' : 'stillframe-capture-panel' });
		var box = element('div', {
			className: 'stillframe-capture-panel__dialog',
			role: 'region',
			'aria-labelledby': 'stillframe-capture-heading'
		});
		var bar = element('div', { className: 'stillframe-bar' });
		var heading = element('h2', {
			id: 'stillframe-capture-heading',
			className: 'stillframe-sr',
			text: text('heading')
		});
		bar.appendChild(heading);

		var widthChoices = element('div', {
			className: 'stillframe-group',
			role: 'group',
			'aria-label': text('width')
		});
		var screenButton = element('button', {
			type: 'button',
			className: 'stillframe-width-screen',
			text: text('screen')
		});
		var useScreen = String(config.defaultPreset || 'screen') === 'screen';
		screenButton.setAttribute('aria-pressed', useScreen ? 'true' : 'false');
		screenButton.addEventListener('click', function () {
			Array.prototype.forEach.call(widthChoices.querySelectorAll('.stillframe-width-preset'), function (item) {
				item.setAttribute('aria-pressed', 'false');
			});
			screenButton.setAttribute('aria-pressed', 'true');
		});
		widthChoices.appendChild(screenButton);

		var presets = Array.isArray(config.presets) ? config.presets : [];
		var defaultPreset = String(config.defaultPreset || 'desktop');
		var sawDefault = false;
		presets.forEach(function (preset) {
			if (!preset || !preset.id) {
				return;
			}
			var width = parseInt(preset.width, 10);
			if (!width) {
				return;
			}
			var button = element('button', {
				type: 'button',
				className: 'stillframe-width-preset',
				text: String(preset.label || width)
			});
			button.setAttribute('data-width', String(width));
			var pressed = preset.id === defaultPreset;
			if (pressed) {
				sawDefault = true;
			}
			button.setAttribute('aria-pressed', pressed ? 'true' : 'false');
			button.addEventListener('click', function () {
				selectWidthButton(button);
			});
			widthChoices.appendChild(button);
		});
		if (!sawDefault && !useScreen) {
			var fallback = widthChoices.querySelector('.stillframe-width-preset');
			if (fallback) {
				fallback.setAttribute('aria-pressed', 'true');
				screenButton.setAttribute('aria-pressed', 'false');
			}
		}

		var scaleChoices = element('div', {
			className: 'stillframe-group',
			role: 'group',
			'aria-label': text('scale')
		});
		var scales = Array.isArray(config.scales) && config.scales.length ? config.scales : [
			{ value: 1, label: '1x' },
			{ value: 2, label: '2x' },
			{ value: 3, label: '3x' }
		];
		var defaultScale = parseInt(config.defaultScale, 10);
		if (defaultScale !== 1 && defaultScale !== 2 && defaultScale !== 3) {
			defaultScale = 1;
		}
		scales.forEach(function (choice) {
			var value = parseInt(choice.value, 10);
			if (value !== 1 && value !== 2 && value !== 3) {
				return;
			}
			var button = element('button', {
				type: 'button',
				className: 'stillframe-scale-choice',
				text: String(choice.label || (value + 'x'))
			});
			button.setAttribute('data-scale', String(value));
			button.setAttribute('aria-pressed', value === defaultScale ? 'true' : 'false');
			button.addEventListener('click', function () {
				Array.prototype.forEach.call(scaleChoices.querySelectorAll('.stillframe-scale-choice'), function (item) {
					item.setAttribute('aria-pressed', item === button ? 'true' : 'false');
				});
			});
			scaleChoices.appendChild(button);
		});
		captureButton = element('button', {
			type: 'button',
			className: 'stillframe-capture-go',
			text: text('capture')
		});
		captureButton.addEventListener('click', function () {
			startCapture('frame');
		});

		downloadButton = element('button', {
			type: 'button',
			className: 'stillframe-download-button',
			text: text('download')
		});
		downloadButton.hidden = true;
		downloadButton.disabled = true;
		downloadButton.addEventListener('click', function () {
			if (!editor || !captured) {
				return;
			}
			downloadButton.disabled = true;
			setStatus(text('preparing'));
			exportBlob().then(function (blob) {
				saveBlob(blob, fileNameFor(captured.url, captured.width, captured.scale));
				if (!panel) {
					return;
				}
				downloadButton.disabled = false;
				setStatus(formatCaptured(captured.width, captured.scale));
			}).catch(function () {
				if (!panel) {
					return;
				}
				downloadButton.disabled = false;
				setStatus(text('downloadFailed'));
			});
		});

		mediaButton = element('button', {
			type: 'button',
			className: 'stillframe-media-button',
			text: text('saveMedia')
		});
		mediaButton.hidden = true;
		mediaButton.disabled = true;
		mediaButton.addEventListener('click', saveToMedia);

		var closeButton = element('button', {
			type: 'button',
			className: 'stillframe-capture-panel__close',
			text: '\u00d7',
			'aria-label': text('close')
		});
		closeButton.addEventListener('click', function () {
			api.closePanel();
		});

		if (!compactPanel) {
			bar.appendChild(widthChoices);
			bar.appendChild(scaleChoices);
			bar.appendChild(captureButton);
		}
		bar.appendChild(downloadButton);
		bar.appendChild(mediaButton);
		bar.appendChild(closeButton);

		statusNode = element('p', {
			className: 'stillframe-capture-status',
			role: 'status'
		});

		editorSection = element('div', { className: 'stillframe-capture-panel__editor' });
		editorSection.hidden = true;
		var stage = element('div', { className: 'stillframe-capture-panel__stage' });
		canvasWrap = element('div', { className: 'stillframe-capture-panel__canvas-wrap' });
		stage.appendChild(canvasWrap);
		var tools = element('div', {
			className: 'stillframe-capture-panel__tools',
			role: 'group',
			'aria-label': text('tools')
		});

		function addTool(name, label, pressed) {
			var button = element('button', {
				type: 'button',
				className: 'stillframe-tool',
				text: label
			});
			button.setAttribute('data-tool', name);
			button.setAttribute('aria-pressed', pressed ? 'true' : 'false');
			button.addEventListener('click', function () {
				Array.prototype.forEach.call(tools.querySelectorAll('.stillframe-tool'), function (item) {
					item.setAttribute('aria-pressed', item === button ? 'true' : 'false');
				});
				if (editor) {
					editor.setTool(name);
				}
			});
			tools.appendChild(button);
			return button;
		}

		penButton = addTool('pen', text('pen'), true);
		addTool('circle', text('circle'), false);
		addTool('arrow', text('arrow'), false);
		undoButton = element('button', {
			type: 'button',
			text: text('undo')
		});
		undoButton.disabled = true;
		undoButton.addEventListener('click', function () {
			if (editor) {
				editor.undo();
			}
		});
		clearButton = element('button', {
			type: 'button',
			text: text('clear')
		});
		clearButton.disabled = true;
		clearButton.addEventListener('click', function () {
			if (editor) {
				editor.clear();
			}
		});
		tools.appendChild(undoButton);
		tools.appendChild(clearButton);

		editorSection.appendChild(tools);
		editorSection.appendChild(stage);

		box.appendChild(bar);
		box.appendChild(statusNode);
		box.appendChild(editorSection);
		root.appendChild(box);

		return {
			root: root,
			dialog: box
		};
	}

	api.isOpen = function () {
		return !!panel;
	};

	api.closePanel = function () {
		session += 1;
		snipBusy = false;
		leaveScene();
		destroySnip();
		removeFrame();
		if (editor) {
			editor.destroy();
			editor = null;
		}
		if (objectUrl) {
			URL.revokeObjectURL(objectUrl);
			objectUrl = '';
		}
		captured = null;
		compactPanel = false;
		resultReady = false;
		pendingAction = '';
		if (resultObserver) {
			resultObserver.disconnect();
			resultObserver = null;
		}
		invalidateViewShot();
		if (keyHandler) {
			document.removeEventListener('keydown', keyHandler, true);
			keyHandler = null;
		}
		if (focusHandler) {
			document.removeEventListener('focusin', focusHandler, true);
			focusHandler = null;
		}
		if (panel && panel.parentNode) {
			panel.parentNode.removeChild(panel);
		}
		panel = null;
		dialog = null;
		statusNode = null;
		compactPanel = false;
		customButton = null;
		customInput = null;
		captureButton = null;
		windowButton = null;
		downloadButton = null;
		mediaButton = null;
		undoButton = null;
		clearButton = null;
		penButton = null;
		editorSection = null;
		canvasWrap = null;
		unlockScroll();
		focusMenu();
	};

	api.openPanel = function (focusReturn, compact) {
		if (panel) {
			if (downloadButton) {
				downloadButton.focus();
			}
			return;
		}
		returnFocus = focusReturn || null;
		try {
			var built = buildPanel(!!compact);
			panel = built.root;
			dialog = built.dialog;
			keyHandler = onKeydown;
			document.addEventListener('keydown', keyHandler, true);
			document.body.appendChild(panel);
			if (downloadButton && !downloadButton.hidden) {
				downloadButton.focus();
			} else if (captureButton) {
				captureButton.focus();
			}
		} catch (error) {
			if (panel && panel.parentNode) {
				panel.parentNode.removeChild(panel);
			}
			panel = null;
			dialog = null;
			removeFrame();
			window.alert(text('captureFailed') || 'The capture failed. The page was not changed.');
			focusMenu();
		}
	};

	api.isSnipping = function () {
		return !!snip;
	};

	api.cancelSnip = function () {
		cancelSnip();
	};

	api.startSnip = function (focusReturn) {
		if (snip) {
			cancelSnip();
			return;
		}
		returnFocus = focusReturn || null;
		if (panel) {
			api.closePanel();
		}
		try {
			openSnip();
		} catch (error) {
			leaveScene();
			destroySnip();
			window.alert(text('captureFailed') || 'The capture failed. The page was not changed.');
		}
	};

	api.captureUrl = function (url, width, scale, options) {
		return captureInFrame(url, width, scale, function () { return false; }, options || {});
	};

	api.openBlobInEditor = function (blob, width, height, scale) {
		if (!blob) return;
		var token = ++session;
		var rect = {
			x: 0,
			y: 0,
			width: width || 1440,
			height: height || 900,
			scale: scale || 1,
			url: window.location.href
		};
		openResult(rect, Promise.resolve(blob), token);
	};

	// Page dropdown with a search box, shared by the capture panel and the Tools screen.
	// getValue() returns '__current__', a URL, or '' when nothing usable is chosen.
	// Paste or type a URL in the search box and it appears as the first choice.
	var pickerCount = 0;

	function pickerTypeLabel(type) {
		var label = String(type || '').replace(/[_-]+/g, ' ');
		return label.charAt(0).toUpperCase() + label.slice(1);
	}

	function pickerLooksLikeUrl(value) {
		return /^https?:\/\/\S+$/i.test(value) || /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(value);
	}

	function createPagePicker(opts) {
		opts = opts || {};
		var MAX_ROWS = 200;
		var CUSTOM = '__custom__';
		var uid = 'stillframe-picker-' + (++pickerCount);
		var homeUrl = opts.homeUrl || '';
		var entries = [];
		var groupOrder = [];
		var rows = [];
		var activeIndex = -1;
		var sel = '';
		var customUrl = '';
		var searchTimer = 0;
		var pendingRender = false;

		function pathOf(url) {
			try {
				return new URL(url, window.location.href).pathname;
			} catch (error) {
				return url;
			}
		}

		function addEntry(entry) {
			if (groupOrder.indexOf(entry.group) === -1) {
				groupOrder.push(entry.group);
			}
			entries.push(entry);
		}

		if (opts.includeCurrent) {
			addEntry({ key: '__current__', title: opts.currentLabel || tr('pickCurrent', 'Current screen'), path: '', type: '', parent: '', group: tr('pickCurrent', 'Current screen') });
		}
		if (homeUrl) {
			addEntry({ key: homeUrl, title: tr('pickHome', 'Home'), path: pathOf(homeUrl), type: '', parent: '', group: tr('pickHome', 'Home') });
		}
		(Array.isArray(opts.pages) ? opts.pages : []).forEach(function (p) {
			if (!p || !p.url || p.url === homeUrl) {
				return;
			}
			var type = String(p.type || 'page');
			addEntry({
				key: p.url,
				title: p.title || 'Page',
				path: p.path || pathOf(p.url),
				type: type,
				parent: p.parent || '',
				group: type === 'page' ? tr('pickPages', 'Pages') : (type === 'post' ? tr('pickPosts', 'Posts') : pickerTypeLabel(type))
			});
		});

		sel = opts.includeCurrent ? '__current__' : (homeUrl || (entries.length ? entries[0].key : ''));

		var root = element('div', { className: 'sfp' });
		var trigger = element('button', { type: 'button', className: 'sfp__trigger', 'aria-haspopup': 'listbox', 'aria-expanded': 'false' });
		var summary = element('span', { className: 'sfp__summary', 'aria-live': 'polite' });
		trigger.appendChild(summary);
		trigger.appendChild(iconSvg('chevronDown', 12));

		var drop = element('div', { className: 'sfp__drop' });
		drop.hidden = true;
		var search = element('input', {
			type: 'text',
			className: 'sfp__search',
			placeholder: tr('pickSearchPlaceholder', 'Search pages or paste a URL'),
			role: 'combobox',
			'aria-label': tr('pickSearch', 'Search pages'),
			'aria-expanded': 'true',
			'aria-controls': uid + '-list',
			'aria-autocomplete': 'list',
			autocomplete: 'off',
			spellcheck: 'false'
		});
		var list = element('div', { className: 'sfp__list', role: 'listbox', id: uid + '-list', 'aria-label': tr('pickPages', 'Pages') });
		drop.appendChild(search);
		drop.appendChild(list);
		root.appendChild(trigger);
		root.appendChild(drop);

		function entryFor(key) {
			for (var i = 0; i < entries.length; i++) {
				if (entries[i].key === key) {
					return entries[i];
				}
			}
			return null;
		}

		function updateSummary() {
			var label = '';
			if (sel === CUSTOM) {
				label = customUrl;
			} else {
				var entry = entryFor(sel);
				label = entry ? entry.title + (entry.path ? '  ' + entry.path : '') : sel;
			}
			summary.textContent = label || tr('pickChoose', 'Choose a page');
		}

		function onOutside(event) {
			if (!root.contains(event.target)) {
				closeDrop(false);
			}
		}

		function openDrop() {
			if (!drop.hidden) {
				return;
			}
			drop.hidden = false;
			trigger.setAttribute('aria-expanded', 'true');
			root.classList.add('is-open');
			document.addEventListener('pointerdown', onOutside, true);
			search.value = '';
			render();
			search.focus();
		}

		function closeDrop(refocus) {
			if (drop.hidden) {
				return;
			}
			drop.hidden = true;
			trigger.setAttribute('aria-expanded', 'false');
			root.classList.remove('is-open');
			document.removeEventListener('pointerdown', onOutside, true);
			if (refocus) {
				trigger.focus();
			}
		}

		function setActive(index, scroll) {
			if (activeIndex > -1 && rows[activeIndex]) {
				rows[activeIndex].node.classList.remove('is-active');
			}
			activeIndex = index;
			if (index > -1 && rows[index]) {
				rows[index].node.classList.add('is-active');
				search.setAttribute('aria-activedescendant', rows[index].node.id);
				if (scroll && rows[index].node.scrollIntoView) {
					rows[index].node.scrollIntoView({ block: 'nearest' });
				}
			} else {
				search.removeAttribute('aria-activedescendant');
			}
		}

		function select(entry) {
			if (entry.custom) {
				sel = CUSTOM;
				customUrl = entry.url;
			} else {
				sel = entry.key;
			}
			updateSummary();
			closeDrop(true);
			if (typeof opts.onChange === 'function') {
				opts.onChange(sel);
			}
		}

		function render() {
			pendingRender = false;
			var query = search.value.trim();
			var tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
			var matched = entries.filter(function (entry) {
				var hay = (entry.title + ' ' + entry.path + ' ' + entry.type + ' ' + entry.parent).toLowerCase();
				return tokens.every(function (token) {
					return hay.indexOf(token) !== -1;
				});
			});

			list.textContent = '';
			rows = [];
			activeIndex = -1;
			search.removeAttribute('aria-activedescendant');

			function addRow(entry) {
				var current = entry.custom ? (sel === CUSTOM && customUrl === entry.url) : entry.key === sel;
				var node = element('div', {
					className: 'sfp__row' + (current ? ' is-selected' : ''),
					role: 'option',
					id: uid + '-o' + rows.length,
					'aria-selected': current ? 'true' : 'false'
				});
				node.appendChild(element('span', { className: 'sfp__title', text: entry.title }));
				var detail = (entry.parent ? entry.parent + '  ' : '') + entry.path;
				if (detail) {
					node.appendChild(element('span', { className: 'sfp__path', text: detail }));
				}
				if (entry.type) {
					node.appendChild(element('span', { className: 'sfp__chip', text: pickerTypeLabel(entry.type) }));
				}
				node.addEventListener('mousedown', function (event) {
					event.preventDefault();
				});
				node.addEventListener('click', function () {
					select(entry);
				});
				rows.push({ entry: entry, node: node });
				list.appendChild(node);
			}

			if (pickerLooksLikeUrl(query)) {
				var url = /^https?:\/\//i.test(query) ? query : 'https://' + query;
				list.appendChild(element('div', { className: 'sfp__group', role: 'presentation', text: tr('pickCustom', 'Custom URL') }));
				addRow({ custom: true, url: url, title: tr('pickUseUrl', 'Use this URL'), path: url, type: '', parent: '' });
			}

			var shown = matched.slice(0, MAX_ROWS);
			groupOrder.forEach(function (group) {
				var inGroup = shown.filter(function (entry) {
					return entry.group === group;
				});
				if (!inGroup.length) {
					return;
				}
				list.appendChild(element('div', { className: 'sfp__group', role: 'presentation', text: group }));
				inGroup.forEach(addRow);
			});

			if (!rows.length) {
				list.appendChild(element('div', { className: 'sfp__note', text: tr('pickNoMatch', 'No matching pages. Paste a full URL to use it.') }));
			} else if (matched.length > MAX_ROWS) {
				list.appendChild(element('div', {
					className: 'sfp__note',
					text: tr('pickShowing', 'Showing %1$d of %2$d. Keep typing to narrow the list.').replace('%1$d', String(MAX_ROWS)).replace('%2$d', String(matched.length))
				}));
			}

			if (query && rows.length) {
				setActive(0, false);
			}
		}

		trigger.addEventListener('click', function () {
			if (drop.hidden) {
				openDrop();
			} else {
				closeDrop(false);
			}
		});
		trigger.addEventListener('keydown', function (event) {
			if (event.key === 'Escape' && typeof opts.onEscape === 'function') {
				event.preventDefault();
				event.stopPropagation();
				opts.onEscape();
			} else if (event.key === 'ArrowDown' && drop.hidden) {
				event.preventDefault();
				openDrop();
			}
		});
		search.addEventListener('input', function () {
			window.clearTimeout(searchTimer);
			pendingRender = true;
			searchTimer = window.setTimeout(render, 80);
		});
		search.addEventListener('keydown', function (event) {
			var key = event.key;
			if (key === 'ArrowDown' || key === 'ArrowUp') {
				event.preventDefault();
				event.stopPropagation();
				if (!rows.length) {
					return;
				}
				var next = activeIndex + (key === 'ArrowDown' ? 1 : -1);
				if (next < 0) {
					next = rows.length - 1;
				} else if (next >= rows.length) {
					next = 0;
				}
				setActive(next, true);
			} else if (key === 'Enter') {
				event.preventDefault();
				event.stopPropagation();
				if (pendingRender) {
					window.clearTimeout(searchTimer);
					render();
				}
				if (activeIndex > -1 && rows[activeIndex]) {
					select(rows[activeIndex].entry);
				}
			} else if (key === 'Escape') {
				event.preventDefault();
				event.stopPropagation();
				closeDrop(true);
			}
		});

		updateSummary();

		return {
			root: root,
			getValue: function () {
				return sel === CUSTOM ? customUrl : sel;
			},
			focusCustom: function () {
				openDrop();
			},
			isCustom: function () {
				return sel === CUSTOM;
			}
		};
	}

	api.createPagePicker = createPagePicker;

	api.openResult = openResult;

	api.openMultiCapture = function (url, devices, scale, hideAdminBar, isFullPage) {
		openMultiDirectCapture(url, devices, scale, hideAdminBar, isFullPage);
	};
})();
