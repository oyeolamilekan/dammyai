# Lessons I Learnt Building a Memory System

When I started building the memory system for DammyAI, my first idea was the obvious one:

**Just save everything.**

At first, that sounded smart. But the more I thought about it, the more I realized it would become a mess.

If the assistant treats every piece of information the same way:

- prompts get noisy
- important facts get buried
- old notes mix with live conversation
- replies become slower and less focused

So I stepped back and asked one simple question:

> **What exactly should the assistant remember, and when should it use it?**

That question shaped the whole architecture.

## Step 1: Separate the current conversation from real memory

The first thing I did was stop treating chat history like permanent memory. Recent messages are useful, but they are only useful for the current moment. So I made **messages** the assistant's short-term memory. That part helps it understand what is happening now.

## Step 2: Create core memory for the small facts that matter often

Next, I thought about the things the assistant should remember across conversations. Things like:

- name
- timezone
- preferences
- communication style

These are small facts, but they matter a lot. So I created **core memory** for them. This part is small on purpose. Only the important facts go there, and when the assistant replies, those facts are loaded directly into the prompt. That makes the assistant feel more personal without making the prompt heavy.

## Step 3: Create archival memory for the longer notes

Then I looked at the other kind of information:

- project notes
- meeting summaries
- detailed instructions
- research context

These are useful, but they do not belong in every prompt. So I created **archival memory**. Instead of loading it all the time, the assistant searches it only when needed. That was a big turning point because it meant I could keep long-term knowledge without carrying too much context in every reply.

## Step 4: Add a memory extraction step after each conversation

After that, I wanted the system to learn naturally. So after each assistant reply, the system checks:

- did the user share a small fact?
- did they share a longer note?
- was there nothing worth saving?

If it is a short fact, it goes to core memory. If it is a longer note, it goes to archival memory. If it is not useful, it gets ignored. That helped keep the memory clean instead of turning it into a junk drawer.

## The final model became very simple

**Messages are for now. Core memory is for always. Archival memory is for later.**

That one idea made the whole system easier to build, easier to reason about, and easier to scale.
Sometimes the best architecture is not the most complex one. It is the one that makes the right separation at the right time.

#AI #Engineering #LLM #SystemDesign #MemoryArchitecture #BuildInPublic
