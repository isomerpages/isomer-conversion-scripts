#!/bin/bash 

## Error-handling ##
# https://gist.github.com/mohitmun/ecaada4ac51b386cd0e3d52dc2193e4f
set -Eeo pipefail

clean_up(){
  if [ $? -ne 0 ]; then
    git checkout staging && git branch -D add-trailing-slash
    echo "\"${last_command}\" command filed with exit code $?." 
  fi
}

trap 'last_command=$current_command; current_command=$BASH_COMMAND' DEBUG
trap clean_up EXIT
####################

modify_permalink () {
  OIFS="$IFS"
  IFS=$'\n'
  md_files=$(find . -type f -name "*.md" -print0 | xargs -0 grep -il "permalink:.*[^/]$")
  modified_files=""
  if [ -z "$md_files" ]; then
    echo "No matching files found." 1>&2
  else
    for file in $md_files
    do
      sed -i '' '/^permalink:/ s/$/\//' $file
      modified_files="$modified_files $file"
    done
  fi
  IFS="$OIFS"
  echo "$modified_files"
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

echo "Creating add-trailing-slash branch"
git checkout -b add-trailing-slash

modified_files=$(modify_permalink)


if [ -z "$modified_files" ]; then
  echo "No files were modified."
else
  echo "Staging modified files: $modified_files"
  # DO NOT use `git add .` as there might be files that we where changed in capilisation
  # and files in mac are case sensitive. 
  git add $modified_files
  git commit -m "migrate: adding trailing slash to permalinks"
  echo "Pushing to remote"
  git push -u origin add-trailing-slash
fi


echo "Migration successful"