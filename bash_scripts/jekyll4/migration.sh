#!/bin/bash 

## Initializing ##

# set script to exit if any command fails and print erred command
set -e
trap 'last_command=$current_command; current_command=$BASH_COMMAND' DEBUG
trap 'echo "\"${last_command}\" command filed with exit code $?."' EXIT

# store original working directory
script_dir=$(pwd)

##################

mkdir -p ~/isomer
cd ~/isomer
if [ ! -d $1 ]; then
  echo "Cloning repo $1"
  git clone https://github.com/isomerpages/$1.git
  cd $1
else
  echo "Using local repo $1 and pulling latest staging changes"
  cd $1
  git stash && git checkout staging && git pull
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

echo "Upgrading Jekyll to 4.0, changing gem dependencies"
bash $script_dir/change-version.sh
git add Gemfile Gemfile.lock .gitignore -f
git commit -m "migrate: upgrading Jekyll to 4.0, changing gem dependencies"

echo "Modifying collection structure"
bash $script_dir/remove-collection.sh
git add .
git commit -m "migrate: modifying collections structure"

echo "Adding deployment script"
cp $script_dir/deploy.sh .
git add deploy.sh
git commit -m "migrate: add deployment script"

# echo "Pushing to remote"
# git push origin migration

echo "Migration successful"
