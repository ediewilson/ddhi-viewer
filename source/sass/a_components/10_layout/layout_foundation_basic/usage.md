#AGILE LAYOUT FOUNDATION

The agile layout foundation is a tier-based system designed for maximum flexibility. It's extremely lightweight, and relies on the designer to handle their own grids (see Post-grid? below). It uses a rudimentary CSS grid. See the sample HTML.

##Tiers
All top level <body> elements (i.e.. body > *) are considered tiers. Tiers span the full width of their devices, with automatic proportional padding. Tiers can also be designated by adding a .tier class.

Tiers are automatically full width – this allows “splash” items that require a full width treatment, or for a standard “bootstrap”-style layout with a full width background (e.g. to have a coloured tier that runs from one edge of the viewport to the other with content inside). In a previous build full-width tiers required a .full class, and you may find vestigial examples in templates.

Tiers can also be designated as a content region by applying the .region class. This will enforce the $max-width variable on the layout width, and ensure that there's sufficient padding on viewports less than $max_width. Padding is determined by the $mobile_edge_padding_factor and $edge_padding_factor variables accordingly.

You can create a hybrid by having a full-width tier with an interior container element assigned the +responsive_inset() mixin, which applies the width restrictions and standardized padding.

#Grid
An oddity of the system is that it requires at least one container below the .region or .tier element to function as expected. This is because there is automated provision a grid of up to three columns, allowing for two sidebars to accompany the main content. If a sidebar is required, just add an <aside> before or after a the central column (either a <div> or <main>). The width of this column is determined by $left_sidebar_width and $right_sidebar_width.

If you're troubleshooting the grid look to ensure that this container element exists, as it looks extraneous when there are no sidebars. 


##Post-grid?
A standard grid layout defines a set number of columns and gaps and scales them responsively. The Agile layout foundation thinks a little differently. All spacing is proportional to the base $scale (which is also used to proportion type) using the rv(\[int\]) function.

Columns are left up to the designer – but should also be a fraction of the available space (3-columns at 1/3, 4 columns at 1/4, .etc) with rv() padding/margins for separation. Stacking elements on mobile can be handled manually. General device-width responsiveness should be driven by the top-level boxes, including .tiers (at 100%) and insets (max-width and legible text insets), with any columns being proportional to them.

In some instances an column (say, a high-level sidebar) needs a fixed width. Using $proportional_width_unit variable is the default approach; $proportional_width_unit provides a standard width as a percentage of available space that's proportional to the overall $scale. The higher the site’s $scale, the wider the $proportional_width_unit, as higher scale sites have increased spaciousness. Local overrides could also express this as a fraction.


##Breakpoints
Breakpoints must be set explicitly in the layout configuration file. It will be left up to the production person to select breakpoints appropriate to the design. All breakpoints are assigned using the +bp() function, e.g. +bp('med'). There are also aliases like $tablet and $desktop which can be set for transparency in the design. There are a few other components that can expand the breakpoint toolkit, including the Vertical Breakpoint (which enables the +vbp() function which lets you adjust layout against viewport height), and the layout_css_variables component, which automatically translates your configured breakpoints into global Javascript variables, ensuring that they're synchronized.

##Stacking
In most responsive designs many side-by-side elements (say three cards) stack on top of each other in mobile views. The $stack breakpoint can be used to determine when that happens. $stack is just an alias for another variable, and the point at which stacking occurs must be set in the layout configuration.