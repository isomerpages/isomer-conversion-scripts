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

# Details

This migration script achieves 3 key changes:

1) Upgrades Gemfile, Gemfile.lock to Jekyll 4.0, removes Github Pages gem, installs Isomer-specific gem dependencies
2) Introduces new collection structure
3) Adds deployment script to repo, necessary for supporting the new collection structure

### Notes
This migration script creates a folder `isomer-migrations` in your root directory and clones the Isomer repo to that directory before running the migration scripts.
If you have an existing Isomer repo in `~/isomer-migrations`, this migration script will not handle any potential merge conflicts for you. Please ensure that your local branch is updated to the latest branch of staging to minimize migration issues.

This migration script does not push the git migration branch to the remote repository yet. To change this, modify `migration.sh` by uncommenting line 61, `# git push origin migration` prior to running the migrations.

# Background
We have decided to migrate Isomer sites to Jekyll 4.0 to use its native reordering capabilities.

### Replacing Github Pages gem
As the Github Pages gem only supports up to Jekyll 3.9, we have decided to remove the Github Pages gem. To do this, we replace the Github Pages gem with the Jekyll 4.0 gem, and install specific Isomer-specific gem dependencies previously provided by Github-pages. These dependencies are:

```
group :jekyll_plugins do
    gem "jekyll-feed", "0.15.1"
    gem "jekyll-sitemap", "1.4.0"
    gem "jekyll-assets", "1.0.0"
    gem "jekyll-paginate", "1.1.0"
    gem "jekyll-remote-theme", "0.4.2"
  end
```

### Updating collections structure
We have decided to migrate Isomer sites to Jekyll 4.0 to use its native reordering capabilities. As part of this migration, we introduce a new collection structure, with two key changes:

1) Each collection will contain a directory file: `collection.yml`, which will store the current order of files, and a boolean value for whether the collection should be included as part of the deployed site, `output: true`. This `collection.yml` follows the format of a Jekyll `_config.yml` file, and acts as an extension to the configurations provided in `<repo>/_config.yml`. A sample `collection.yml` is as follows:
```
collections:
  about-us:
    output: true
    order:
      - mission/goals.md
      - mission/statement.md
      - contacts.md
```

2) Collections with third-nav files will now have explicit nesting folders for these third-nav files. While this change does not change any current functionality of Isomer sites, we introduce this in preparation for refactoring Isomer templates to remove the `third_nav_title` metatag.  An example of the new collection structure is as follows:

```
_about-us/
  - collection.yml
  - mission
    - goals.md
    - statement.md
  - contacts.md
```

### Deployment script
The `collection.yml` files extend the configurations provided in `<repo>/_config.yml` and have to be provided to the Jekyll build command under the `--config` option when the site is built, for example `JEKYLL_ENV=staging jekyll build --config _config.yml,_about-us/collection.yml`. We introduce a new deployment script to generate the build command automatically based on the contents of the repo at build time, `deploy.sh`.

The deployment script takes the option `-e` for accepting Jekyll build environment, for example `bash deploy.sh -e staging`.


# Repos tested on so far
- ogp
- govtech-stp
- a-test

# To-dos
- Potentially give options of where directories should be cloned to 
