"""Lightweight, dependency-free sentiment detection (English + common Hinglish).

It is deliberately simple and fast. The label is used to adapt the bot's tone and is
stored for analytics. Swap in a transformer model later without touching the views.
"""
import re

POSITIVE = {
    "good", "great", "awesome", "amazing", "love", "excellent", "thanks", "thank", "perfect",
    "happy", "nice", "wonderful", "best", "helpful", "cool", "fantastic", "super",
    "accha", "badhiya", "shukriya", "dhanyavad", "mast",
}
NEGATIVE = {
    "bad", "terrible", "awful", "hate", "worst", "angry", "annoyed", "useless", "stupid",
    "broken", "wrong", "problem", "issue", "sad", "upset", "frustrated", "disappointed",
    "slow", "refund", "complaint", "bekar", "ganda", "pareshan", "galat", "gussa",
}
NEGATIONS = {"not", "no", "never", "don't", "dont", "isn't", "isnt", "wasn't", "cant", "can't", "nahi", "na"}

TONE_HINTS = {
    "negative": (
        "The user seems frustrated or upset. Respond with extra empathy, acknowledge the "
        "problem briefly, and focus on a clear, practical solution."
    ),
    "positive": "The user seems happy. Match their positive energy while staying helpful.",
    "neutral": "",
}


def analyze(text: str) -> str:
    words = re.findall(r"[\w']+", text.lower())
    score = 0
    for i, w in enumerate(words):
        polarity = 1 if w in POSITIVE else -1 if w in NEGATIVE else 0
        if not polarity:
            continue
        if i > 0 and words[i - 1] in NEGATIONS:
            polarity = -polarity
        score += polarity
    if score > 0:
        return "positive"
    if score < 0:
        return "negative"
    return "neutral"
