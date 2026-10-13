-- First FreeReader blog post.
insert into public.blog_posts (slug, title, excerpt, content, author_name, category, read_time_minutes, status, published_at)
values (
  'how-freereader-helps-people-with-dyslexia-enjoy-reading',
  'How FreeReader Helps People With Dyslexia Enjoy Reading',
  'FreeReader is a free text-to-speech reading platform that helps people with dyslexia and ADHD turn books, documents, and articles into natural-sounding audio.',
  $post$We believe that reading should be fun for everyone. Unfortunately for a large portion of the world's population, reading can be one of the most frustrating activities possible. People with dyslexia and ADHD often struggle to read visually or stay focused long enough to finish the reading.

FreeReader was built to help.

FreeReader is a free text-to-speech reading platform designed to make books, documents, and online content more accessible and easier to understand. By transforming written text into natural-sounding audio, FreeReader gives readers with disabilities another way to consume information and enjoy their favorite stories.

Let's explore the accessibility features that can make reading a more comfortable for people who don't normally enjoy reading.

## Turn Written Words Into Natural-Sounding Audio

One of the biggest obstacles for people with dyslexia is the mental effort required to decode written words. Reading anything can demand so much concentration that understanding and remembering the content is difficult.

Text-to-speech helps tremendously here.

FreeReader transforms written content into spoken audio using realistic voices in more than 30 languages. Readers are able to HEAR the words while they SEE them. They now have two sources of context to help their comprehension. Listening while reading can make information easier to approach.

## Make Physical Books and Documents Accessible

It can be difficult to listen along when the reading material is a physical document, obviously. FreeReader uses Optical Character Recognition (OCR) technology to scan physical text and convert it to digital text. The digital text is then turned into audio.

This opens up new possibilities for accessing everyday information, including:

- Printed worksheets and classroom handouts
- Pages from physical books
- Study guides and educational materials
- Letters, instructions, and other printed documents

## Read at whatever pace works best

There are fast readers and slow readers. Personally, I am a very slow reader. For me, it's important for my audio playback to match my reading speed.

FreeReader lets you slow down or speed up the narration in order to boost comprehension as much as possible.

We want to create the most comfortable environment for readers possible. If this sounds like it would help you, check out FreeReader.io. Upload your own documents or start listening to a free classic book.$post$,
  'FreeReader Team',
  'Accessibility',
  4,
  'published',
  now()
)
on conflict (slug) do nothing;
