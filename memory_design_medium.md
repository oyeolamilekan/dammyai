# Designing a Simple Memory Architecture for an AI Assistant

One of the easiest ways to make an AI assistant messy is to give it a bad memory design.

If the assistant treats every piece of information the same way, problems start quickly:

- prompts become too large
- important details get buried
- old notes mix with current conversation
- the assistant becomes less consistent

That is why I like simple memory systems.

For DammyAI, the memory architecture is built around one idea:

> **Messages are for now, core memory is for always, and archival memory is for later.**

That single idea shapes the whole system.

## The problem with one big memory bucket

At first, it may seem smart to store everything in one place and feed it back to the model.

But in practice, that creates a lot of noise.

Not every piece of information should be treated the same way.

For example:

- "My name is Dammy" is a small fact the assistant should remember often
- "Here are the notes from my meeting last week" is useful, but it does not need to appear in every reply
- The last few chat messages matter right now, but they are not permanent facts

These are three different kinds of memory.

So they should live in three different places.

## The three-part memory model

DammyAI uses three simple parts:

1. **Messages**
2. **Core memory**
3. **Archival memory**

Each one has a clear job.

### 1. Messages: short-term memory

The `messages` table stores the conversation itself.

It keeps:

- what the user said
- what the assistant said
- tool outputs when tools are used

This is the assistant's short-term memory.

When a new user message arrives, the system loads recent messages so the assistant understands the current context.

This helps the assistant stay on track in the active conversation.

But messages are not enough on their own.

Recent chat tells the assistant what is happening now, but it does not tell the assistant what should be remembered across conversations.

That is where core memory comes in.

### 2. Core memory: small facts that matter often

The `coreMemories` table stores short facts about the user.

These are things like:

- name
- timezone
- role
- preferred language
- communication style

Each memory is stored as a simple key-value pair.

For example:

```text
name -> Dammy
timezone -> Africa/Lagos
```

This part stays intentionally small.

That is important.

Core memory is loaded directly into the system prompt when the assistant responds. Because of that, only the most useful and compact facts should live here.

If too much goes into core memory, the prompt becomes noisy and expensive. If the right things go into core memory, the assistant feels more personal and more consistent.

In simple terms, core memory helps the assistant remember the user without carrying too much weight.

### 3. Archival memory: long-term notes

The `archivalMemories` table stores longer information.

This includes things like:

- meeting notes
- project briefs
- research notes
- multi-step instructions
- detailed user preferences

This is the long-term note system.

Unlike core memory, archival memory is not loaded into every prompt.

Instead, it is searched only when needed.

That is a very important design choice.

It means the system keeps large notes available without forcing the assistant to carry them all the time.

So the assistant stays lighter, faster, and cleaner.

## How the full flow works

The full memory flow is simple:

1. The user sends a message
2. The system loads recent messages
3. The system loads core memories
4. The system builds the prompt
5. The assistant replies
6. The conversation is saved
7. A memory step checks whether anything new should be remembered

That last step is where the design becomes especially useful.

After the reply is finished, the system looks at:

- the user's message
- the assistant's response
- the core facts already saved

Then it decides what to do.

If it finds a short fact, it saves that as **core memory**.

If it finds a longer piece of useful context, it saves that as **archival memory**.

If it finds nothing important, it saves nothing.

This helps the assistant learn over time without filling the memory with junk.

## Why splitting memory works better

The separation between core memory and archival memory is what makes the system practical.

### Core memory is optimized for recall

Core memory is for the facts the assistant should use often and quickly.

Because these facts go into the prompt, the assistant can act on them right away.

This is perfect for stable user facts.

### Archival memory is optimized for lookup

Archival memory is for information that matters, but not all the time.

Instead of loading everything into the prompt, the assistant searches these notes only when the user asks for them or when extra context is needed.

This avoids wasting context window on information that may not matter in the current moment.

### Messages are optimized for the present moment

Messages help the assistant stay grounded in the current conversation.

They are not permanent facts and they are not long-term notes.

They are simply the active working context.

Each memory type does one job well.

That is what makes the architecture easy to reason about.

## Searching archival memory

When the user asks questions like:

- "What did I say about that project?"
- "Do you remember my meeting notes?"
- "What were my earlier instructions?"

the assistant can search archival memory.

The search is intentionally simple.

It checks for matching words in:

- the content of the note
- the tags attached to the note

Then it returns the best matches.

This does not need to be overly complex to be useful.

Often, a simple and understandable retrieval method is better than a complicated one that is harder to debug.

## Why I like this architecture

I like this design for four reasons.

### 1. It is simple

There is a clear role for every part:

- messages handle current conversation
- core memory handles small facts
- archival memory handles long notes

That clarity matters.

### 2. It is efficient

Only the smallest important facts are loaded every time.

Long notes stay out of the prompt until they are needed.

That reduces waste.

### 3. It is personal

Memory is scoped to the user.

That helps the assistant behave in a more consistent and more human way.

### 4. It is manageable

Because the memory types are separate, they are easier to inspect, list, search, and delete.

That makes the system easier to maintain and easier for users to trust.

## Final thought

Good AI memory does not mean remembering everything.

It means remembering the **right thing in the right place**.

That is the main idea behind this design.

Instead of building one giant memory bucket, DammyAI separates:

- current conversation
- small important facts
- long notes for later

That simple split makes the assistant easier to scale, easier to improve, and easier to trust.
