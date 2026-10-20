# Work URLs live at the root

Home is `/`. About is `/about`. Contact is `/contact`. A Work is `/:slug` (for example `/bcms`).

`about` and `contact` are reserved slugs and cannot name a Work. Root slugs were chosen over `/works/:slug` to keep Work URLs short; the reserved pair is the collision control.
