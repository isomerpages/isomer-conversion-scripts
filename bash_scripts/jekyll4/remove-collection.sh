#!/bin/bash 

# Initializing #

# set script to exit if any command fails and print erred command
set -e
trap 'last_command=$current_command; current_command=$BASH_COMMAND' DEBUG
trap 'echo "\"${last_command}\" command filed with exit code $?."' EXIT

################

remove_config_blurb () {
  # brute force approach for removing collection blurb
  # find line numbers where 'collections:' appear
  # starting on the following line after "collections:"
  #   check whether line has space indent
  #     if indent, line is an attribute of collections; continue checking
  #     else, line is a new key; note down the current line number
  file='_config.yml'

  line_nums=$(grep -n 'collections:' $file | cut -d : -f 1)
  LAST_LINE_NUM=$(wc -l < $file | bc)
  var=""

  for line_num in $line_nums
  do
    var="${var}${line_num}"
    COUNT=${line_num}
    while IFS= read -r line || [ -n "$line" ]; do
      if [[ $line != $' '* ]]; then
        var="${var},${COUNT} d;"
        break
      fi
      COUNT=$(( $COUNT + 1 ))
    done < <(tail -n "+$(( $line_num + 1 ))" $file)
    
    # if last line of file is an attribute on "collections:",
    # we specify line number manually
    if [[ $var != *';' ]]; then
      var="${var},${LAST_LINE_NUM} d;"
    fi
  done

  sed -i "" "${var}" $file
}

modify_collections () {

  # https://unix.stackexchange.com/questions/9496/looping-through-files-with-spaces-in-the-names
  collections=$(ls -d _*/ | grep -v "_data\|_includes\|_site")
  
  OIFS="$IFS"
  IFS=$'\n'
  for collection in $collections
  do
    cd "$collection"
    modify_collection ${collection:1: ${#collection}-2}
    cd ..
  done
  IFS="$OIFS"
}

modify_collection() {
  # $1 is collection name
  
  # ls *.md >> tmp.txt # debugging purposes

  # clean up
  tmp_file='tmp_renamed.txt'
  rm -f $tmp_file

  # get list of all markdown files
  files=$(find . -name '*.md' | sort -n)
  for file in $files
  do
    raw_third_nav=$(grep_attribute "third_nav_title:" $file)
    raw_title=$(grep_attribute "title:" $file)
    cleaned_title=$(slugify "$raw_title")

   if [[ $raw_title ]]; then
   # if jekyll format markdown file 
    if [[ -z $raw_third_nav ]]; then 
      # if second level
        # rename file
        mv $file "$cleaned_title.md"
        # update in tmp file
        echo "$cleaned_title.md" >> $tmp_file
      
      else 
      # if third level  
        cleaned_third_nav=$(slugify "$raw_third_nav")
        # if directory does not exist
        if [ ! -d "$cleaned_third_nav" ]; then
          mkdir "$cleaned_third_nav"
        fi
        # rename and move file
        mv "$file" "$cleaned_third_nav/$cleaned_title.md"
        # update in tmp file
        echo "$cleaned_third_nav/$cleaned_title.md" >> $tmp_file     
      fi
  fi
  done

  generate_collection_yml $1 $tmp_file
  rm $tmp_file
}

slugify() {
  # slugify code from https://gist.github.com/oneohthree/f528c7ae1e701ad990e6
  echo "$1" | iconv -t ascii//TRANSLIT | sed -E s/[^a-zA-Z0-9]+/-/g | sed -E s/^-+\|-+$//g | tr A-Z a-z | head -c 255
}

grep_attribute() {
  # $1 is search term, $2 is search file
  echo $(grep -w $1 $2 | sed 's/^.*: //')
}

generate_collection_yml () {
  # $1 is collection name, $2 is tmp_renamed.txt
  {
    echo "collections:"
    echo "  $1:"
    echo "    output: true"
    echo "    order:"
  } >> collection.yml

  while IFS= read -r line || [ -n "$line" ]; do
    {
      echo "      - $line"
    } >> collection.yml
  done < $2
}

remove_config_blurb
modify_collections