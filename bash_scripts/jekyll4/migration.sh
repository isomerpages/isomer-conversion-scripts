#!/bin/bash 

## Error-handling ##
# https://gist.github.com/mohitmun/ecaada4ac51b386cd0e3d52dc2193e4f
set -Eeo pipefail

clean_up(){
  if [ $? -ne 0 ]; then
    git checkout staging && git branch -D migration
    echo "\"${last_command}\" command filed with exit code $?." 
  fi
}

trap 'last_command=$current_command; current_command=$BASH_COMMAND' DEBUG
trap clean_up EXIT
####################

# store original working directory
script_dir=$(pwd)

# get latest staging changes
mkdir -p ~/isomer-migrations
cd ~/isomer-migrations
if [ ! -d $1 ]; then
  echo "Cloning repo $1"
  git clone https://github.com/isomerpages/$1.git
  cd $1
else
  echo "Using local repo $1 and pulling latest staging changes"
  cd $1
  git stash && git checkout staging && git pull -q
fi

echo "Running compatibility checks"
# check template version
if ! grep -Fxq "remote_theme: isomerpages/isomerpages-template@next-gen" _config.yml; then
  echo "$1 is not v2 repo" && exit 1
fi
# check for nested collections
if [ $(find . -path "./_*" -mindepth 2 -maxdepth 2 -type d | grep -v "_data/*\|_includes/*\|_site/*" | wc -l) -ne 0 ]; then
    read -p "Collections has nested folders, proceed with renaming? If no, migration will be aborted. (y/n)" -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Aborting migration" && exit 1 
    fi
fi
echo "Compatible: v2 repo, no nested collections"

echo "Creating migration branch"
git checkout -b migration

echo "Changing gem to isomer-jekyll"
bash $script_dir/update-gem.sh
git add Gemfile .gitignore -f
git rm netlify.toml .ruby-version Gemfile.lock -f
git commit -m "migrate: upgrading Jekyll to 4.0, changing gem dependencies"

echo "Modifying collection structure"
bash $script_dir/generate-collections-structure.sh
git add .
git commit -m "migrate: modifying collections structure"

# echo "Pushing to remote"
# git push origin migration

echo "Migration successful"
