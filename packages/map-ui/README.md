# @access-maps/map-ui

MapLibre GL components for the App. The feature list is the keyboard and screen-reader interface. The canvas is `aria-hidden` because the list names every feature, including washrooms, elevators, and legs. Zoom controls are buttons. Status uses words and a symbol, not colour alone.

`JourneyResult` renders a plan from `@access-maps/journey`: warnings before the legs, a separate approach, scheduled times, the return, and entrance, washroom, and parking text.

The demo (`npm run demo`) uses fixture coordinates. It is not an operator feed and not a survey.

MapLibre GL is BSD-3-Clause. When a leg's drawn line is OpenStreetMap path geometry, the map shows © OpenStreetMap contributors and the ODbL, and the leg's source line shows its licence, credit, retrieval date, and tier. A path from another source does not get that credit. An OpenStreetMap basemap, when one is configured, must show the same credit. This package does not imply endorsement by MapLibre, OpenStreetMap, or any agency.

French chrome is a draft (`MAP_FRENCH_REVIEW`).
