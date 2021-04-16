# Usage

Ensure that you have brew installed before running the migration: this migration will also install [jq](https://stedolan.github.io/jq/)

To run migration:
```
git clone https://github.com/isomerpages/isomer-conversion-scripts.git
cd isomer-conversion-scripts/bash_scripts/jekyll4
source ../../.env
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

This migration script achieves 2 key changes:

1) Upgrades Gemfile to Isomer Jekyll Gem, removes Github Pages gem and unused files, specifies Isomer-specific gem plugins [gem](https://github.com/opengovsg/isomer-jekyll) [details for gem rationale](https://docs.google.com/document/d/1ZVSgFhNClGL0K9Q8udePnwftPJ1Qex61Y0QG8QOXM9A/edit#)
2) Introduces new collections structure along with placeholder files [details on collections structure](https://docs.google.com/document/d/1cEwlLZHuq-xLpL2nDB9q3QmivAkgmvhPRFMbGo-sGg8/edit#) [details on placeholder files](https://docs.google.com/document/d/1EccpS_ATrfOe4DmU4ChXtU9kV6Jl1rFOdKqBLyG6ym8/edit#heading=h.gg92ziy86rq7)

### Notes
This migration script creates a folder `isomer-migrations` in your root directory and clones the Isomer repo to that directory before running the migration scripts.
If you have an existing Isomer repo in `~/isomer-migrations`, this migration script will not handle any potential merge conflicts for you. Please ensure that your local branch is updated to the latest branch of staging to minimize migration issues.

# Background
We have decided to migrate Isomer sites to Jekyll 4.0 to use its native reordering capabilities. As part of the migration, we have created an Isomer Jekyll gem for version control.

### Replacing Github Pages gem with Isomer Jekyll gem
As the Github Pages gem only supports up to Jekyll 3.9, we have decided to remove the Github Pages gem and update Jekyll to 4.0. To do this, we replace the Github Pages gem with the Isomer Jekyll gem, and specify Isomer-specific gem plugins previously provided by Github-pages. These dependencies are:

```
plugins:
  - jekyll-feed
  - jekyll-assets
  - jekyll-paginate
  - jekyll-sitemap
  - jekyll-remote-theme
```

By creating an Isomer-specific gem, we will be able to version control without having to redeploy sites each time the gem dependencies for Isomer repos updates.

### Updating collections structure
We introduce a new collection structure, with three key changes:

1) Each collection will contain a directory file: `collection.yml`, which will store the current order of files, and a boolean value for whether the collection should be included as part of the deployed site, `output: true`. This `collection.yml` follows the format of a Jekyll `_config.yml` file, and acts as an extension to the configurations provided in `<repo>/_config.yml`. A sample `collection.yml` is as follows:
```
collections:
  about-us:
    output: true
    order:
      - mission/.keep
      - mission/goals.md
      - mission/statement.md
      - contacts.md
```
2) Placeholder files `.keep` are added to the Isomer collection subfolders, as well as nested images and files, to allow empty subfolders to be maintained on Isomer sites. Placeholder files are also added to the `collection.yml` file.
```
collections:
  about-us:
    output: true
    order:
      - mission/.keep
      - vision/.keep
```

3) Collections with third-nav files will now have explicit nesting folders for these third-nav files. While this change does not change any current functionality of Isomer sites, we introduce this in preparation for refactoring Isomer templates to remove the `third_nav_title` metatag.  An example of the new collection structure is as follows:

```
_about-us/
  - collection.yml
  - mission
    - .keep
    - goals.md
    - statement.md
  - contacts.md
```

