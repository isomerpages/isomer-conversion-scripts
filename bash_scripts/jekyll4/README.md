# Usage

To run migration:
```
git clone https://github.com/isomerpages/isomer-conversion-scripts.git
cd isomer-conversion-scripts/bash_scripts/jekyll4
bash migration.sh <repo-name>
```

After migrating, if you wish to build the bundle locally for testing purposes:
```
cd ~/isomer/<repo-name>
# modify the deploy.sh file by:
# 1. uncomment line 29, `# bundle exec jekyll serve --config _config.yml"$var"`
# 2. comment out line 26, `JEKYLL_ENV=$env jekyll build --config _config.yml"$var"`
bash deploy.sh
```

# Of note
This migration script creates a folder `isomer-migrations` in your root directory and clones the Isomer repo to that directory before running the migration scripts.
If you have an existing Isomer repo in `~/isomer-migrations`, this migration script will not handle any potential merge conflicts for you. Please ensure that your local branch is updated to the latest branch of staging to minimize migration issues.

This migration script does not push the git migration branch to the remote repository yet. To change this, modify `migration.sh` by uncommenting line 61, `# git push origin migration` prior to running the migrations.

# Repos tested on so far
- ogp
- govtech-stp

# To-dos
- Improve error handling
- Improve recovery
- Potentially give options of where directories should be cloned to 
