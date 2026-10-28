# General instructions

## Git

- Commit and push straight to `main`. Don't create branches or pull requests unless I ask.

## Plans

When asked for a plan:

- Write it for a junior engineer who has not seen our conversation. Name the files, functions and
  types to add or change, give signatures for new code, say what each test should check, and end
  with manual checks to run in the app.
- Keep the spec (what the result must be) and the plan (how to get there) in separate files. The
  plan says that where the two disagree, the spec wins.
- Split the work into stages in order. Each stage is one commit, or a few, and every commit leaves
  the tests and the build passing.
- Never mention branch names in a plan.
- Don't plan a migration of existing data unless I ask for one. Say what data is dropped instead.
- Write down the decisions you made that we didn't discuss, and list them in your reply so I can
  overrule them.

## Design discussions

- Read the code before answering, and cite `file:line` for claims about how it behaves now.
- Give one recommendation with its trade-off, not a survey of options.
- When I ask you to restate something in your own words, do that, and list the details that still
  need deciding as questions.

## Writing

- Match the existing docs' and code's style: their comment density, naming and tone.
- New modules start with a comment saying what belongs in them.
