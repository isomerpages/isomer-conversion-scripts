# Usage

```
git clone https://github.com/isomerpages/isomer-conversion-scripts.git
cd isomer-conversion-scripts/bash_scripts/jekyll4
bash migration.sh <repo-name>
```

# Of note
This migration script creates a folder `isomer` in your root directory and clones the Isomer repo to that directory before running the migration scripts.
If you have an existing Isomer repo in `~/isomer`, this migration script will not handle any potential merge conflicts for you. Please ensure that your local branch is updated to the latest branch of staging to minimize migration issues.

# To-dos
- Improve error handling
- Potentially give options of where directories should be cloned to 
