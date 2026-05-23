# Memory Architecture

DammyAI remembers things in a very simple way.

It uses **three parts**:

1. **Messages** for recent chat
2. **Core memory** for small important facts
3. **Archival memory** for longer notes

You can think of it like this:

- **Messages** = what is happening now
- **Core memory** = small facts that should stay true
- **Archival memory** = longer notes to look up later

## 1. Messages: the short-term memory

The `messages` table stores the conversation.

It saves:

- what the user said
- what the assistant said
- tool results when tools are used

This is the assistant's **short-term memory**.

When a new message comes in, the system loads recent messages so the assistant understands the current conversation.

## 2. Core memory: the small facts

The `coreMemories` table stores short facts about the user.

These are things like:

- name
- timezone
- job title
- writing style
- language preference

Each item is stored as a simple **key and value**.

Example:

```text
timezone -> Africa/Lagos
name -> Dammy
```

This memory is kept small on purpose.

Why?

Because these facts are important often, so the system loads them directly into the prompt every time the assistant replies.

That helps the assistant stay personal and consistent.

## 3. Archival memory: the long notes

The `archivalMemories` table stores longer information.

This is for things like:

- project notes
- meeting summaries
- detailed instructions
- research notes
- longer preferences

This is the assistant's **long-term notes shelf**.

These notes are **not** loaded into every prompt.

Instead, the assistant searches them only when needed.

This keeps the prompt smaller, faster, and cleaner.

## How the full flow works

Here is the simple flow:

1. The user sends a message.
2. The system loads recent messages.
3. The system loads core memories.
4. The system builds the prompt.
5. The assistant replies.
6. The new conversation is saved.
7. After that, the system checks if there is anything worth remembering.

If it finds something new:

- a short fact goes to **core memory**
- a longer note goes to **archival memory**

## How new memories are created

After the assistant responds, a memory step runs in the background.

It reads:

- the user's message
- the assistant's reply
- the facts already saved

Then it decides:

- **Is this a short fact?** Save it as core memory.
- **Is this a longer note?** Save it as archival memory.
- **Is it nothing important?** Save nothing.

So the assistant can learn useful things over time without filling memory with noise.

## Why core memory and archival memory are separate

This split is important.

### Core memory is for things the assistant should remember often

These facts are loaded directly into the system prompt.

That means the assistant can use them right away.

### Archival memory is for things the assistant may need later

These notes are searched only when needed.

That means the system does not carry big notes all the time.

This gives a good balance:

- **fast replies**
- **personal answers**
- **less wasted context**

## Search in archival memory

When the user asks something like:

- "What did I say about that project?"
- "Do you remember my meeting notes?"
- "What were my earlier instructions?"

the assistant can search archival memory.

The search is simple.

It looks for matching words in:

- the note content
- the note tags

Then it returns the best matches.

## Memory tools

The assistant has tools to manage memory safely.

These tools let it:

- save a core memory
- delete a core memory
- save an archival memory
- search archival memory
- delete an archival memory

This is useful because the assistant does not write directly in a random way.

It goes through clear memory actions.

## Why this design works well

This design is good for a few simple reasons.

### It is easy to understand

There is a clear job for each part:

- messages handle the current chat
- core memory holds small facts
- archival memory holds long notes

### It is efficient

Only small important facts are loaded every time.

Big notes are searched only when needed.

### It is personal

Each memory is tied to a user.

So one user's memory does not mix with another user's memory.

### It is manageable

Users can list and delete saved memories.

That makes the system easier to trust.

## Simple mental model

You can remember the whole design with one line:

> **Messages are for now, core memory is for always, and archival memory is for later.**

## Main code areas

If you want to look at the code, the main parts are:

- `convex/schema.ts` — defines the memory tables
- `convex/aiStore.ts` — loads chat history and core memory
- `convex/ai/memory.ts` — extracts new memories after a conversation
- `convex/aiTools.ts` — saves, searches, and deletes memory
- `convex/ai/engine.ts` — puts everything together during an AI reply

## Final note

The memory architecture is simple on purpose.

It does not try to put everything into one big memory bucket.

Instead, it separates:

- current conversation
- small important facts
- long notes for later

That makes the assistant easier to scale, easier to reason about, and easier to improve.
