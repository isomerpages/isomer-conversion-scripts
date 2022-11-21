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
  echo "1"
  md_files=$(find . -type f -name "*.md" -print0 | xargs -0 grep -il "permalink:.*[^/]$")
  echo "2"
  for file in $md_files
  do
    sed -i '' '/^permalink:/ s/$/\//' $file
  done
  IFS="$OIFS"
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

modify_permalink

git add .
git commit -m "migrate: adding trailing slash to permalinks"
echo "Pushing to remote"
git push -u origin add-trailing-slash

echo "Migration successful"
