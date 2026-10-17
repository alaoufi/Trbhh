# Compact CJ purchase and source size chart
P1. Follow requested layout: remove fixed bottom purchase link; put specs/description beneath image on desktop, after purchase on mobile; compact spacing without removing labels or tap targets.
Read CJ product/sizeChart/query by PID. Display US/EU and gender labels only if supplier chart provides them. No conversion tables, gender inference or price changes. Values in option value/VID/SKU stay unchanged.
Tests: strict chart response identity/shape, configured=false, ambiguous matches, original option identity, compact rendered layout, source links/auth access, live supplier read and safe variant freight check. Payment/invoice/tracking not exercised.
