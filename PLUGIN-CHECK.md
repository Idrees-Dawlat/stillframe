# Plugin Check

Plugin Check was not run for this working copy.

The check needs WordPress and the Plugin Check plugin. Stillframe was not copied into a site, and WordPress was not installed here to make the check pass.

From a WordPress directory where Plugin Check is already installed, run:

```bash
wp plugin check /absolute/path/to/stillframe --require=./wp-content/plugins/plugin-check/cli.php
```

That command checks this folder by path. It does not require activating Stillframe.

Static checks alone, without the runtime bootstrap in `cli.php`:

```bash
wp plugin check /absolute/path/to/stillframe
```

Replace `/absolute/path/to/stillframe` with the path to this plugin folder.
