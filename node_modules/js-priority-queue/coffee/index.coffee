# This library is defined in terms of AMD modules, but some people will want a
# standalone version. This file, plus almond.js, provides that.
#
# If you're using an AMD loader, ignore this file.
require [ './PriorityQueue' ], (PriorityQueue) -> window.PriorityQueue = PriorityQueue
