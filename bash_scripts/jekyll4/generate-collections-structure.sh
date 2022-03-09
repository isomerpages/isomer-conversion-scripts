#!/bin/bash 

## Error-handling ##
# https://gist.github.com/mohitmun/ecaada4ac51b386cd0e3d52dc2193e4f
set -Eeo pipefail
trap 'last_command=$current_command; current_command=$BASH_COMMAND' DEBUG
trap 'echo "\"${last_command}\" command filed with exit code $?."' EXIT
####################

## Parse yaml ##
# https://github.com/jasperes/bash-yaml/blob/master/script/yaml.sh
parse_yaml() {
  local yaml_file=$1
  local prefix=$2
  local s
  local w
  local fs
  s='[[:space:]]*'
  w='[a-zA-Z0-9_.-]*'
  fs="$(echo @|tr @ '\034')"
  (
    sed -e '/- [^\“]'"[^\']"'.*: /s|\([ ]*\)- \([[:space:]]*\)|\1-\'$'\n''  \1\2|g' |
    sed -ne '/^--/s|--||g; s|\"|\\\"|g; s/[[:space:]]*$//g;' \
      -e 's/\$/\\\$/g' \
      -e "/#.*[\"\']/!s| #.*||g; /^#/s|#.*||g;" \
      -e "s|^\($s\)\($w\)$s:$s\"\(.*\)\"$s\$|\1$fs\2$fs\3|p" \
      -e "s|^\($s\)\($w\)${s}[:-]$s\(.*\)$s\$|\1$fs\2$fs\3|p" |
    awk -F"$fs" '{
      indent = length($1)/2;
      if (length($2) == 0) { conj[indent]="+";} else {conj[indent]="";}
      vname[indent] = $2;
      for (i in vname) {if (i > indent) {delete vname[i]}}
        if (length($3) > 0) {
          vn=""; for (i=0; i<indent; i++) {vn=(vn)(vname[i])("_")}
          printf("%s%s%s%s=(\"%s\")\n", "'"$prefix"'",vn, $2, conj[indent-1], $3);
        }
      }' |
    sed -e 's/_=/+=/g' |
    awk 'BEGIN {
            FS="=";
            OFS="="
        }
        /(-|\.).*=/ {
            gsub("-|\\.", "_", $1)
        }
        { print }'
  ) < "$yaml_file"
}

create_config_variables() {
  file="_config.yml"
  read -p "Config file: replace 4 space with 2 space? (y/n)" -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "replacing 4 space with 2 space"
    sed  -i '' 'h;s/[^ ].*//;s/    /  /g;G;s/\n *//' "$file"
  fi
  prefix="config_"
  yaml_string=$(parse_yaml "$file" "$prefix")
  eval $yaml_string
}
##################

remove_config_collection_blurb () {
  # brute force approach for removing collection blurb
  # find line numbers where 'collections:' appear
  # starting on the following line after "collections:"
  #   check whether line has space indent
  #     if indent, line is an attribute of collections; continue checking
  #     else, line is a new key; note down the current line number
  file='_config.yml'

  if [ -z "$(grep -n 'collections:' $file | cut -d : -f 1)" ]; then
   echo "No collections"
  else
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
  fi
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
      cd "$collection"
      modify_collection ${collection:1: ${#collection}-2} # get substring(1:-2) for _abc/
      cd ..
    done
    IFS="$OIFS"
  fi

  
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
    # Remove quotes
    raw_third_nav="${raw_third_nav%\'}"
    raw_third_nav="${raw_third_nav#\'}"
    raw_third_nav="${raw_third_nav%\"}"
    raw_third_nav="${raw_third_nav#\"}"
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
        cleaned_third_nav="$raw_third_nav"
        echo "third nav: =============== $cleaned_third_nav ==============="
        # if directory does not exist
        if [ ! -d "$cleaned_third_nav" ]; then
          mkdir "$cleaned_third_nav"
          # create placeholder file and add to collection.yml
          touch "$cleaned_third_nav/.keep"
          echo "$cleaned_third_nav/.keep" >> $tmp_file
        fi
        # rename and move file
        mv "$file" "$cleaned_third_nav/$cleaned_title.md"
        # update in tmp file
        echo "$cleaned_third_nav/$cleaned_title.md" >> $tmp_file     
      fi
    else 
      echo "$file has no frontmatter. Continuing migration."
  fi
  done

  if [ -f "$tmp_file" ]; then
    generate_collection_yml $1 $tmp_file
    rm $tmp_file
  else 
    echo "Collection $1 has 0 files with frontmatter. Aborting migration." && exit 1 
  fi
}

slugify() {
  # slugify code from https://gist.github.com/oneohthree/f528c7ae1e701ad990e6
  echo "$1" | iconv -t ascii//TRANSLIT | sed -E s/[^a-zA-Z0-9]+/-/g | sed -E s/^-+\|-+$//g | tr A-Z a-z | head -c 255
}

grep_attribute() {
  # $1 is search term, $2 is search file
  echo $(grep -w -m 1 $1 $2 | sed 's/^.*: //')
}

generate_collection_yml () {
  # $1 is collection name, $2 is tmp_renamed.txt
  tmp_name="config_collections_$(echo $1 | tr '-' '_')_output"
  
  # output value defaults to false if not defined or false in config.yml
  output="false"
  for varname in $tmp_name; do 
    if [[ ${!varname} == "true" ]]; then
      output=${!varname}
    fi
  done

  {
    echo "collections:"
    echo "  $1:"
    echo "    output: $output"
    echo "    order:"
  } >> collection.yml

  while IFS= read -r line || [ -n "$line" ]; do
    {
      echo "      - $line"
    } >> collection.yml
  done < $2
}

create_config_variables
remove_config_collection_blurb
modify_collections
