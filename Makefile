localize:
	find *.md _posts/*.md | sort -r | xargs -L 1 node _scripts/image-localize.js
