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
# check for jq installation
if ! brew ls --versions jq; then
  # jq not installed
  echo "Installing jq"
  echo brew install jq
fi
# check for staging and prod website in repo description
description=$(curl -X GET -u $PERSONAL_ACCESS_TOKEN:x-oauth-basic https://api.github.com/repos/isomerpages/$1 | jq -r '. |  .description')
if [[ ! -z "$description" ]]; then
  IFS='; ' read -r -a array <<< "$description"
  for element in "${array[@]}"
  do
    if [[ $element == *"https"* && $element == *"staging"* ]]; then
      echo "Found staging url"
      {
        echo "staging: $element"
      } >> _config.yml
    elif [[ $element == *"https"* && $element == *"prod"* ]]; then
      echo "Found prod url"
      {
        echo "prod: $element"
      } >> _config.yml
    fi
  done
else
  read -p "Unable to find staging and prod websites, proceed? If no, migration will be aborted. (y/n)" -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Aborting migration" && exit 1 
    fi
fi
# check for markdown pages outside of /pages
if [ $(find . -name "*.md" -maxdepth 1 | grep -v "index.md\|README.md" | wc -l) -ne 0 ]; then
  read -p "Repo has .md pages outside of /pages, proceed with migration? If no, migration will be aborted. (y/n)" -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborting migration" && exit 1 
  fi
fi
echo "Compatible: v2 repo"

echo "Creating migration branch"
git checkout -b migration

echo "Changing gem to isomer-jekyll"
bash $script_dir/update-gem.sh
git add Gemfile .gitignore netlify.toml -f
git rm .ruby-version Gemfile.lock -f
git commit -m "migrate: upgrading Jekyll to 4.0, changing gem dependencies"

echo "Modifying collection structure"
bash $script_dir/generate-collections-structure.sh
git add .

echo "Adding placeholder files to nested image and file directories"
if [ -d "images" ]; then
  IFS=$'\n'
  cd images
  img_dirs=$(find . -type d)
  for dir in $img_dirs
  do
    if [[ $dir != "." ]]; then
      touch "$dir"/.keep
      git add .
    fi
  done
  cd ..
fi

if [ -d "files" ]; then
  IFS=$'\n'
  cd files
  file_dirs=$(find . -type d)
  for dir in $file_dirs
  do
    if [[ $dir != "." ]]; then
      touch "$dir"/.keep
      git add .
    fi
  done
  cd ..
fi

git commit -m "migrate: modifying collections, image, and file structure"
echo "Pushing to remote"
git push origin migration

echo "Migration successful"
