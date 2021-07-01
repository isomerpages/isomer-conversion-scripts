#!/bin/bash 

## Error-handling ##
# https://gist.github.com/mohitmun/ecaada4ac51b386cd0e3d52dc2193e4f
set -Eeo pipefail

clean_up(){
  if [ $? -ne 0 ]; then
    git checkout staging && git branch -D third-nav-fix
    echo "\"${last_command}\" command filed with exit code $?." 
  fi
}

trap 'last_command=$current_command; current_command=$BASH_COMMAND' DEBUG
trap clean_up EXIT
####################

grep_attribute() {
  # $1 is search term, $2 is search file
  echo $(grep -w -m 1 $1 $2 | sed 's/^.*: //')
}

modify_collections () {
  # https://unix.stackexchange.com/questions/9496/looping-through-files-with-spaces-in-the-names
  if [ -z "$(ls -d _*/ | grep -v "_data\|_includes\|_site\|_layouts")" ]; then
   echo "No collections"
  else
    collections=$(ls -d _*/ | grep -v "_data\|_includes\|_site\|_layouts")
    OIFS="$IFS"
    IFS=$'\n'
    for collection in $collections
    do
      echo $collection
      cd "$collection"
      modify_third_navs
      cd ..
    done
    IFS="$OIFS"
  fi

  
}

modify_third_navs() {
  if [ -z "$(ls -d */)" ]; then
   echo "No third navs"
  else
    third_navs=$(ls -d */)
    tmp_dir='tmp_dir'
    for third_nav in $third_navs
    do
      cd "$third_nav"
      if [ -z "$(find . -name '*.md')" ]; then
        echo "No third nav files"
        cd ..
      else
        # get list of all markdown files
        files=$(find . -name '*.md' | sort -n)
        raw_third_nav=$(grep_attribute "third_nav_title:" ${files[0]})
        cd ..

        # update collection.yml
        sed -i '' "s|^\([[:blank:]]*\)- ${third_nav}|\1- ${raw_third_nav}/|gI" collection.yml

        # move to temp dir in case only changes are capitalisation
        mv $third_nav $tmp_dir
        mv $tmp_dir "$raw_third_nav/"
      fi
    done
  fi
}

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
if [ $(find . -path "./_*" -mindepth 2 -maxdepth 2 -type d | grep -v "_data/*\|_includes/*\|_site/*" | wc -l) -eq 0 ]; then
  echo "No third nav folders found, aborting migration" && exit 1 
fi
echo "Compatible: v2 repo"

echo "Creating third-nav-fix branch"
git checkout -b third-nav-fix

modify_collections

git add .
git commit -m "migrate: modifying third nav folder titles"
# echo "Pushing to remote"
# git push origin third-nav-fix

echo "Migration successful"
