(function () {
	'use strict';

	var data = window.StillframeToolsData || {};
	var captureApi = window.StillframeCapture || {};

	var pageSelect = document.getElementById('stillframe-target-page');
	var customUrlWrap = document.getElementById('stillframe-custom-url-wrap');
	var customUrlInput = document.getElementById('stillframe-custom-url');
	var startBtn = document.getElementById('stillframe-start-multicapture');
	var progressWrap = document.getElementById('stillframe-progress-wrap');
	var progressMsg = document.getElementById('stillframe-progress-message');
	var resultsSection = document.getElementById('stillframe-results-section');
	var resultsGrid = document.getElementById('stillframe-results-grid');
	var saveAllBtn = document.getElementById('stillframe-save-all-btn');
	var downloadAllBtn = document.getElementById('stillframe-download-all-btn');

	var capturedItems = [];

	// Ensure initial hidden state for progress wrap
	if (progressWrap) {
		progressWrap.hidden = true;
		progressWrap.style.display = 'none';
		progressWrap.classList.remove('is-active');
	}

	// Interactive Device Cards
	var deviceCards = document.querySelectorAll('.stillframe-device-tile, .stillframe-device-item, .stillframe-device-card');
	Array.prototype.forEach.call(deviceCards, function (card) {
		var cb = card.querySelector('input[type="checkbox"]');
		if (!cb) return;

		cb.addEventListener('change', function () {
			if (cb.checked) {
				card.classList.add('is-active');
			} else {
				card.classList.remove('is-active');
			}
		});
	});

	// Interactive Radio Pills (Resolution & Height)
	var pillGroups = document.querySelectorAll('.stillframe-pill-selector');
	Array.prototype.forEach.call(pillGroups, function (group) {
		var pills = group.querySelectorAll('.stillframe-pill');
		Array.prototype.forEach.call(pills, function (pill) {
			var radio = pill.querySelector('input[type="radio"]');
			if (!radio) return;

			radio.addEventListener('change', function () {
				Array.prototype.forEach.call(pills, function (p) {
					var r = p.querySelector('input[type="radio"]');
					if (r && r.checked) {
						p.classList.add('is-active');
					} else {
						p.classList.remove('is-active');
					}
				});
			});
		});
	});

	// Page Picker Select Handling
	if (pageSelect) {
		pageSelect.addEventListener('change', function () {
			var isCustom = pageSelect.value === '__custom__';
			if (customUrlWrap) {
				customUrlWrap.hidden = !isCustom;
				customUrlWrap.style.display = isCustom ? 'block' : 'none';
			}
			if (isCustom && customUrlInput) {
				customUrlInput.focus();
			}
		});
	}

	function getTargetUrl() {
		if (!pageSelect) return '';
		if (pageSelect.value === '__custom__') {
			return customUrlInput ? customUrlInput.value.trim() : '';
		}
		return pageSelect.value.trim();
	}

	function setBusy(busy, message) {
		if (startBtn) {
			startBtn.disabled = busy;
		}
		if (progressWrap) {
			progressWrap.hidden = !busy;
			if (busy) {
				progressWrap.classList.add('is-active');
				progressWrap.style.display = 'flex';
			} else {
				progressWrap.classList.remove('is-active');
				progressWrap.style.display = 'none';
			}
		}
		if (progressMsg) {
			progressMsg.textContent = message || '';
		}
	}

	function getSelectedDevices() {
		var checkboxes = document.querySelectorAll('input[name="stillframe_devices[]"]:checked');
		var list = [];
		Array.prototype.forEach.call(checkboxes, function (cb) {
			var val = cb.value;
			var width = parseInt(cb.getAttribute('data-width'), 10) || 1440;
			var label = val === 'desktop' ? 'Desktop' : (val === 'ipad' ? 'iPad' : 'Mobile');
			list.push({
				id: val,
				label: label,
				width: width
			});
		});
		return list;
	}

	function getScale() {
		var selected = document.querySelector('input[name="stillframe_scale"]:checked');
		return selected ? parseInt(selected.value, 10) || 2 : 2;
	}

	function getHeightMode() {
		var selected = document.querySelector('input[name="stillframe_height_mode"]:checked');
		return selected ? selected.value : 'viewport';
	}

	function formatBytes(bytes) {
		if (!bytes || bytes <= 0) return '0 KB';
		if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
		return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
	}

	function downloadBlob(blob, filename) {
		var link = document.createElement('a');
		var url = URL.createObjectURL(blob);
		link.href = url;
		link.download = filename;
		document.body.appendChild(link);
		link.click();
		setTimeout(function () {
			if (link.parentNode) link.parentNode.removeChild(link);
			URL.revokeObjectURL(url);
		}, 100);
	}

	function saveBlobToMedia(blob, filename, statusNode, buttonNode) {
		if (!data.ajaxUrl || !data.mediaNonce) {
			if (statusNode) {
				statusNode.textContent = 'Media upload configuration missing.';
			}
			return Promise.reject(new Error('config'));
		}
		if (buttonNode) {
			buttonNode.disabled = true;
		}
		if (statusNode) {
			statusNode.hidden = false;
			statusNode.textContent = 'Saving to Media Library...';
		}

		var formData = new FormData();
		formData.append('action', 'stillframe_save_media');
		formData.append('nonce', data.mediaNonce);
		formData.append('image', blob, filename);

		return fetch(data.ajaxUrl, {
			method: 'POST',
			body: formData
		}).then(function (res) {
			return res.json();
		}).then(function (result) {
			if (buttonNode) {
				buttonNode.disabled = false;
			}
			if (result && result.success && result.data) {
				if (statusNode) {
					statusNode.hidden = false;
					statusNode.innerHTML = '<span>&#10003; Saved!</span> <a href="' + (result.data.editUrl || result.data.url) + '" target="_blank" rel="noopener noreferrer">View in Media</a>';
				}
				return result.data;
			}
			throw new Error((result && result.data && result.data.message) || 'Save failed');
		}).catch(function (error) {
			if (buttonNode) {
				buttonNode.disabled = false;
			}
			if (statusNode) {
				statusNode.hidden = false;
				statusNode.textContent = error.message || 'Save failed';
			}
			throw error;
		});
	}

	function renderCard(item) {
		var card = document.createElement('div');
		card.className = 'stillframe-card-item';

		// Mockup browser header bar
		var header = document.createElement('div');
		header.className = 'stillframe-mockup-bar';

		var dots = document.createElement('div');
		dots.className = 'stillframe-mockup-dots';
		dots.innerHTML = '<span></span><span></span><span></span>';

		var title = document.createElement('div');
		title.className = 'stillframe-mockup-device-title';
		title.textContent = item.device.label;

		var badge = document.createElement('span');
		badge.className = 'stillframe-mockup-badge';
		badge.textContent = item.device.width + 'px @ ' + item.scale + 'x';

		header.appendChild(dots);
		header.appendChild(title);
		header.appendChild(badge);

		// Image preview stage
		var stage = document.createElement('div');
		stage.className = 'stillframe-preview-stage';
		var img = document.createElement('img');
		img.src = item.objectUrl;
		img.alt = item.device.label + ' screenshot';
		img.title = 'Click to view full size';
		img.addEventListener('click', function () {
			openLightbox(item.objectUrl);
		});
		stage.appendChild(img);

		// Card footer with metadata & buttons
		var footer = document.createElement('div');
		footer.className = 'stillframe-card-footer';

		var metaLine = document.createElement('div');
		metaLine.className = 'stillframe-card-meta-line';
		metaLine.innerHTML = '<span>' + (item.device.width * item.scale) + ' px width</span><span>' + formatBytes(item.blob.size) + '</span>';

		var btnRow = document.createElement('div');
		btnRow.className = 'stillframe-card-buttons';

		// Open in Editor button
		var editBtn = document.createElement('button');
		editBtn.type = 'button';
		editBtn.className = 'stillframe-btn stillframe-btn--secondary';
		editBtn.title = 'Open in Editor to annotate, draw arrows, etc.';
		editBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg> Edit';
		editBtn.addEventListener('click', function () {
			var engine = window.StillframeCapture || {};
			if (typeof engine.openBlobInEditor === 'function') {
				engine.openBlobInEditor(item.blob, item.device.width, item.device.estHeight || 900, item.scale);
			} else if (typeof engine.openResult === 'function') {
				engine.openResult({ x: 0, y: 0, width: item.device.width, height: item.device.estHeight || 900, scale: item.scale, url: window.location.href }, Promise.resolve(item.blob), Date.now());
			} else {
				openLightbox(item.objectUrl);
			}
		});

		var dlBtn = document.createElement('button');
		dlBtn.type = 'button';
		dlBtn.className = 'stillframe-btn stillframe-btn--secondary';
		dlBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg> Download';
		dlBtn.addEventListener('click', function () {
			downloadBlob(item.blob, item.filename);
		});

		var saveBtn = document.createElement('button');
		saveBtn.type = 'button';
		saveBtn.className = 'stillframe-btn stillframe-btn--primary';
		saveBtn.title = 'Save to Media Library';
		saveBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="4.5" width="17" height="15" rx="2.5"></rect><circle cx="9" cy="10" r="1.6"></circle><path d="M20.5 16l-5-5L8 19.5"></path></svg> Save';

		var status = document.createElement('div');
		status.className = 'stillframe-status-tag';
		status.hidden = true;

		saveBtn.addEventListener('click', function () {
			saveBlobToMedia(item.blob, item.filename, status, saveBtn);
		});

		btnRow.appendChild(editBtn);
		btnRow.appendChild(dlBtn);
		btnRow.appendChild(saveBtn);

		footer.appendChild(metaLine);
		footer.appendChild(btnRow);
		footer.appendChild(status);

		card.appendChild(header);
		card.appendChild(stage);
		card.appendChild(footer);

		item.cardStatus = status;
		item.cardSaveBtn = saveBtn;

		return card;
	}

	function openLightbox(src) {
		var box = document.createElement('div');
		box.className = 'stillframe-lightbox';
		var fullImg = document.createElement('img');
		fullImg.src = src;
		box.appendChild(fullImg);
		box.addEventListener('click', function () {
			if (box.parentNode) box.parentNode.removeChild(box);
		});
		document.body.appendChild(box);
	}

	function startCapture() {
		var url = getTargetUrl();
		if (!url) {
			window.alert('Please select a target page or enter a URL to capture.');
			if (pageSelect && pageSelect.value === '__custom__' && customUrlInput) {
				customUrlInput.focus();
			}
			return;
		}

		var devices = getSelectedDevices();
		if (!devices.length) {
			window.alert('Please select at least one device to capture.');
			return;
		}

		var engine = window.StillframeCapture || captureApi || {};
		if (typeof engine.captureUrl !== 'function') {
			window.alert('Stillframe capture engine is still loading. Please try again in a few moments.');
			return;
		}

		var scale = getScale();
		var heightMode = getHeightMode();
		var isFullPage = heightMode === 'fullpage';
		var hideAdminBarEl = document.getElementById('stillframe-hide-admin-bar');
		var hideAdminBar = hideAdminBarEl ? hideAdminBarEl.checked : true;

		setBusy(true, 'Starting capture queue...');
		capturedItems = [];
		if (resultsGrid) {
			resultsGrid.innerHTML = '';
		}
		if (resultsSection) {
			resultsSection.hidden = true;
			resultsSection.style.display = 'none';
		}

		var cleanHost = 'site';
		try {
			cleanHost = new URL(url).hostname.replace(/[^a-z0-9_-]/gi, '-');
		} catch (e) {
			cleanHost = data.siteName || 'site';
		}

		var sequence = Promise.resolve();

		devices.forEach(function (dev, index) {
			sequence = sequence.then(function () {
				setBusy(true, 'Capturing ' + dev.label + ' (' + (index + 1) + '/' + devices.length + ')...');
				return engine.captureUrl(url, dev.width, scale, {
					fullPage: isFullPage,
					hideAdminBar: hideAdminBar
				}).then(function (blob) {
					var filename = cleanHost + '-' + dev.id + '-' + scale + 'x.png';
					var objectUrl = URL.createObjectURL(blob);
					var item = {
						device: dev,
						scale: scale,
						blob: blob,
						objectUrl: objectUrl,
						filename: filename
					};
					capturedItems.push(item);
					if (resultsGrid) {
						resultsGrid.appendChild(renderCard(item));
					}
					if (resultsSection) {
						resultsSection.hidden = false;
						resultsSection.style.display = 'block';
					}
				});
			});
		});

		sequence.then(function () {
			setBusy(false, 'Capture complete!');
		}).catch(function (error) {
			setBusy(false, 'Capture failed: ' + (error.message || 'Unknown error'));
			window.alert('Failed to capture page: ' + (error.message || 'Could not render target'));
		});
	}

	if (startBtn) {
		startBtn.addEventListener('click', startCapture);
	}

	if (downloadAllBtn) {
		downloadAllBtn.addEventListener('click', function () {
			if (!capturedItems.length) return;
			capturedItems.forEach(function (item, i) {
				setTimeout(function () {
					downloadBlob(item.blob, item.filename);
				}, i * 300);
			});
		});
	}

	if (saveAllBtn) {
		saveAllBtn.addEventListener('click', function () {
			if (!capturedItems.length) return;
			saveAllBtn.disabled = true;
			var saves = capturedItems.map(function (item) {
				return saveBlobToMedia(item.blob, item.filename, item.cardStatus, item.cardSaveBtn);
			});
			Promise.allSettled(saves).then(function () {
				saveAllBtn.disabled = false;
			});
		});
	}
})();
