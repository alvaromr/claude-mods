# Each call's result as the transcript file keeps it, the parts drawn: an
# edit's hunks, or the lines of a file it created; the files a command changed;
# the image or PDF a read took in. $wanted is the array of tool_use ids to pick.
. as $row
| select(.type == "user" and (.toolUseResult | type) == "object")
| .message.content[]? | select(.type == "tool_result") | .tool_use_id as $id
| select(any($wanted[]; . == $id))
| { id: $id, output: ($row.toolUseResult | {
    type,
    structuredPatch,
    content: (if .type == "create" then .content else null end),
    bashEditDiff: (if (.bashEditDiff | type) == "object" then { files: [.bashEditDiff.files[]? | { filePath, hunks }] } else null end),
    file: (if (.file | type) == "object" then (.file | { originalSize, dimensions }) else null end)
  }) }
