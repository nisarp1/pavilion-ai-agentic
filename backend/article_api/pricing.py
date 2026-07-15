"""Token → cost estimation for the productized article API.

USD per 1M tokens (input, output). Overridable exchange rate via USD_INR_RATE env.
"""
import os

USD_INR = float(os.environ.get("USD_INR_RATE", "86"))

# (provider, model) -> (input $/Mtok, output $/Mtok)
PRICING = {
    ("gemini", "gemini-2.5-flash"): (0.30, 2.50),
    ("gemini", "gemini-2.5-flash-lite"): (0.10, 0.40),
    ("claude", "claude-opus-4-8"): (5.0, 25.0),
    ("claude", "claude-sonnet-4-6"): (3.0, 15.0),
    ("claude", "claude-haiku-4-5"): (1.0, 5.0),
    ("bedrock", "google.gemma-3-27b-it"): (0.50, 0.50),
}


def _rate(provider, model):
    if (provider, model) in PRICING:
        return PRICING[(provider, model)]
    for (p, _m), v in PRICING.items():
        if p == provider:
            return v
    return (1.0, 5.0)


def cost_usd(provider, model, in_tok, out_tok):
    ri, ro = _rate(provider, model)
    return (in_tok / 1_000_000.0) * ri + (out_tok / 1_000_000.0) * ro


def cost_inr(provider, model, in_tok, out_tok):
    return round(cost_usd(provider, model, in_tok, out_tok) * USD_INR, 4)
