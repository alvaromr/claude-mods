# Each pasted image of the transcript file by its number: the image block of
# the user message whose `imagePasteIds` holds it, at the same place. $wanted is
# the array of numbers to pick.
select(.type == "user" and (.imagePasteIds | type) == "array")
| .imagePasteIds as $ids
| [.message.content[]? | select(.type == "image")] as $images
| range(0; $ids | length) as $i
| select(any($wanted[]; . == $ids[$i]))
| "\($ids[$i]) \($images[$i].source.media_type // "") \($images[$i].source.data // "")"
