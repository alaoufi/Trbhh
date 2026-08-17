# Dynamic Ad Form Builder Design

## Goal

Extend the private Dynamic Ads Lab so an administrator can build an entity form from ordered field groups without affecting legacy or public ads.

## Model

Each entity owns ordered groups. Every field belongs to one group and has separate input/display ordering and visibility controls. Supported types are text, textarea, number, decimal, date, yes/no, one choice, multiple choices, location, and media. Choice types persist an ordered option list.

## Administration and rendering

The admin page is arranged per entity: manage groups, then add or update a field in a selected group. Every field can be required, searchable, input-visible, display-visible, and assigned input/display positions. The private form renders basic ad data first then the ordered field groups; the report renders only display-visible values.

## Safety and verification

The feature remains exclusive to the hidden Smart Ads Lab. Server validation accepts only active entity fields and validates multi-choice values. No legacy/public ad route, wallet, payment, or Agar behaviour changes. Tests cover types, multi-choice validation, grouping/order, and additive SQL compatibility.
