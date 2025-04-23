#!/bin/bash

npx treer -e output.txt -d src

TREE_CONTENT=$(cat output.txt)

TEMP_FILE=$(mktemp)

START_LINE=$(grep -n "## File Tree" README.md | cut -d: -f1)

head -n $START_LINE README.md > $TEMP_FILE

echo -e "\n\`\`\`\n$TREE_CONTENT\n\`\`\`\n" >> $TEMP_FILE

NEXT_LINE_NUM=$(tail -n +$(($START_LINE + 1)) README.md | grep -n "^##" | head -1 | cut -d: -f1)

if [ -n "$NEXT_LINE_NUM" ]; then
  NEXT_LINE=$(($START_LINE + $NEXT_LINE_NUM))
  tail -n +$NEXT_LINE README.md >> $TEMP_FILE
fi

mv $TEMP_FILE README.md

rm -f output.txt

npm run build

echo "File Tree updated & build success."