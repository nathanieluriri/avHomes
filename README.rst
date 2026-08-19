=======
AVHomes
=======

Real estate landing, listings, and property detail pages for AVHomes, styled after
AV Constructions (https://www.avconstructionsltd.com) and built on Next.js 16 with
OpenNext so it can deploy to Cloudflare Workers as is.

Getting started
===============

.. code-block:: bash

   npm install
   npm run dev

Visit http://localhost:3000.

Demo data versus live API
=========================

All data access goes through ``src/lib/data.ts``. Pages and components never touch
demo data or an API directly, so the switch is a single environment variable.

.. code-block:: bash

   # .env.local
   DATA_MODE=demo        # default, uses src/lib/demo-data.ts, no network calls
   # DATA_MODE=api
   # API_BASE_URL=https://api.avhomes.com

In ``api`` mode these endpoints are expected, returning JSON matching
``src/lib/types.ts``:

============================  ==================
Endpoint                      Returns
============================  ==================
``GET /properties``           ``Property[]``
``GET /properties/:slug``     ``Property``
``GET /testimonials``         ``Testimonial[]``
``GET /stats``                ``SiteStat[]``
``GET /insights``             ``Insight[]``
============================  ==================

If a fetch fails or ``API_BASE_URL`` is unset, the layer falls back to demo data so
the site never breaks while a backend is being wired up.

Images
======

Every image is local, under ``public/images/library``:

- ``exterior-01`` to ``exterior-13``, ``interior-01`` to ``interior-12``: architectural
  photography from Unsplash, free for commercial use.
- ``person-01`` to ``person-06``, ``team-01`` to ``team-03``: portraits and team shots.
- ``av-render-01`` to ``av-render-05``, ``av-photo-01`` to ``av-photo-03``: real project
  imagery pulled from the AV Constructions site.

These are stand ins. Replace the paths in ``src/lib/demo-data.ts`` (or the live API
payloads) with real photography and nothing else needs to change. A larger reference
set is kept out of the build at ``reference/av-construction``.

Pages
=====

- ``/`` landing page: hero, floating search strip, featured listings, client marquee,
  about with animated counters, insights, testimonials, closing call to action.
- ``/listings`` filterable grid with category chips, search, and skeleton loading.
- ``/listings/[slug]`` property detail with gallery lightbox, spec grid, and agent panel.

Design notes
============

- Soft, rounded surfaces. Card depth comes from a one pixel border that turns blue and
  lifts on hover, never a blurred shadow. ``box-shadow`` is globally disabled.
- Emphasis words in headings use the ``.accent`` class (italic Instrument Serif in blue).
- Scroll reveal is gated behind ``@media (scripting: enabled)`` so content is fully
  visible without JavaScript, and both the reveal and counter components fall back to
  their final state if an IntersectionObserver callback is missed.

Deploying to Cloudflare
=======================

.. code-block:: bash

   npm run preview   # build and preview through wrangler
   npm run deploy    # build and deploy

Configuration lives in ``wrangler.jsonc`` and ``open-next.config.ts``.
