using System.Net.Http.Json;
using System.Text.Json.Serialization;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddHttpClient("Ollama", client =>
{
    client.BaseAddress = new Uri("http://localhost:11434");
    client.Timeout = TimeSpan.FromMinutes(5);
});

var app = builder.Build();
app.UseDefaultFiles();
app.UseStaticFiles();


// -------------------------------------------------------
// STATUS
// -------------------------------------------------------

app.MapGet("/", () => Results.Redirect("/index.html"));

app.MapGet("/api/status", async (
    IHttpClientFactory httpClientFactory) =>
{
    try
    {
        var client =
            httpClientFactory.CreateClient("Ollama");

        using var response =
            await client.GetAsync("/api/tags");

        if (!response.IsSuccessStatusCode)
        {
            return Results.Ok(new
            {
                available = false,
                modelInstalled = false,
                model = "gemma3:4b",
                message = "Ollama is not responding."
            });
        }

        var tags = await response.Content
            .ReadFromJsonAsync<OllamaTagsResponse>();

        var installed = tags?.Models?.Any(model =>
            model.Name.Equals(
                "gemma3:4b",
                StringComparison.OrdinalIgnoreCase)
            ||
            model.Name.StartsWith(
                "gemma3:4b:",
                StringComparison.OrdinalIgnoreCase)
        ) ?? false;

        return Results.Ok(new
        {
            available = true,
            modelInstalled = installed,
            model = "gemma3:4b",
            message = installed
                ? "Gemma 3 4B is ready on this computer."
                : "Ollama is running, but Gemma 3 4B is not installed."
        });
    }
    catch (HttpRequestException)
    {
        return Results.Ok(new
        {
            available = false,
            modelInstalled = false,
            model = "gemma3:4b",
            message = "Ollama is unavailable. Start Ollama and try again."
        });
    }
    catch (TaskCanceledException)
    {
        return Results.Ok(new
        {
            available = false,
            modelInstalled = false,
            model = "gemma3:4b",
            message = "The Ollama status check timed out."
        });
    }
});

// -------------------------------------------------------
// GENERATE QUEST
// -------------------------------------------------------

app.MapPost("/api/quest", async (
    QuestRequest request,
    IHttpClientFactory httpClientFactory) =>
{
    var allowedDurations =
        new[] { 10, 20, 30, 45 };

    var allowedEnvironments =
        new[]
        {
            "neighborhood",
            "park",
            "garden",
            "trail",
            "beach"
        };

    var allowedGoals =
        new[]
        {
            "move",
            "explore",
            "notice-nature",
            "clear-my-head"
        };

    var allowedActivityLevels =
        new[]
        {
            "easy",
            "normal",
            "active"
        };

    var allowedCompanions =
        new[]
        {
            "solo",
            "with-someone"
        };


    // ---------------------------------------------------
    // VALIDATION
    // ---------------------------------------------------

    if (!allowedDurations.Contains(request.DurationMinutes))
    {
        return Results.BadRequest(new
        {
            message =
                "Duration must be 10, 20, 30, or 45 minutes."
        });
    }

    var environment =
        request.Environment?.Trim().ToLowerInvariant()
        ?? "";

    if (!allowedEnvironments.Contains(environment))
    {
        return Results.BadRequest(new
        {
            message =
                "Unsupported environment."
        });
    }

    var goal =
        request.Goal?.Trim().ToLowerInvariant()
        ?? "";

    if (!allowedGoals.Contains(goal))
    {
        return Results.BadRequest(new
        {
            message =
                "Unsupported goal."
        });
    }

    var activityLevel =
        request.ActivityLevel?.Trim().ToLowerInvariant()
        ?? "";

    if (!allowedActivityLevels.Contains(activityLevel))
    {
        return Results.BadRequest(new
        {
            message =
                "Unsupported activity level."
        });
    }

    var companion =
        request.Companion?.Trim().ToLowerInvariant()
        ?? "";

    if (!allowedCompanions.Contains(companion))
    {
        return Results.BadRequest(new
        {
            message =
                "Unsupported companion option."
        });
    }


    // ---------------------------------------------------
    // PROMPT
    // ---------------------------------------------------

    var systemPrompt = """
        You are GrassQuest Local.

        Your job is to create one short outdoor micro-adventure
        that encourages the user to stop looking at the screen
        and spend time outside.

        The experience must feel playful, achievable and specific
        to the user's available time and chosen environment.

        IMPORTANT DESIGN RULES:

        1. The screen should be the shortest part of the experience.

        2. Create activities that can be remembered easily without
           repeatedly checking the device.

        3. Give exactly 5 quest tasks.

        4. Tasks should be short, concrete and different from one another.

        5. Do not require special equipment.

        6. Do not require taking photos.

        7. Do not require internet access.

        8. Do not require knowing the user's exact location.

        9. Do not tell the user to trespass or enter private property.

        10. Do not encourage dangerous climbing, entering roads,
            unstable terrain, swimming, or other risky behavior.

        11. Do not tell the user to touch, eat or collect unknown
            plants, fungi, insects or animals.

        12. Do not tell the user to approach wildlife.

        13. Do not ask the user to photograph or interact with strangers.

        14. Keep activities suitable for ordinary public or permitted areas.

        15. Respect the requested activity level.

        16. Do not present health or medical advice.

        17. Do not describe the tasks as therapy.

        18. The quest must fit realistically within the selected duration.

        BINGO RULES:

        After the quest, create exactly 9 simple things the user might
        notice outside.

        The bingo items should be:
        - easy to understand
        - safe to observe
        - possible in the selected environment
        - mostly visual or auditory
        - no interaction required

        OUTPUT:

        Return valid JSON only.

        Do not use Markdown.

        Follow exactly this structure:

        {
          "title": "Short adventure title",
          "intro": "One short sentence introducing the quest.",
          "tasks": [
            "Task 1",
            "Task 2",
            "Task 3",
            "Task 4",
            "Task 5"
          ],
          "bingo": [
            "Item 1",
            "Item 2",
            "Item 3",
            "Item 4",
            "Item 5",
            "Item 6",
            "Item 7",
            "Item 8",
            "Item 9"
          ],
          "returnQuestion": "One short reflection question for when the user returns."
        }
        """;


    var userPrompt = $"""
        Create an outdoor GrassQuest using these preferences:

        Time available:
        {request.DurationMinutes} minutes

        Environment:
        {GetReadableEnvironment(environment)}

        Goal:
        {GetReadableGoal(goal)}

        Activity level:
        {GetReadableActivityLevel(activityLevel)}

        Going:
        {GetReadableCompanion(companion)}

        Make the quest practical for this exact combination.
        """;


    var ollamaRequest =
        new OllamaChatRequest
        {
            Model = "gemma3:4b",

            Stream = false,

            Format = "json",

            Messages =
            [
                new OllamaMessage
                {
                    Role = "system",
                    Content = systemPrompt
                },

                new OllamaMessage
                {
                    Role = "user",
                    Content = userPrompt
                }
            ],

            Options =
                new OllamaOptions
                {
                    Temperature = 0.7
                }
        };


    // ---------------------------------------------------
    // OLLAMA
    // ---------------------------------------------------

    try
    {
        var client =
            httpClientFactory.CreateClient("Ollama");

        var response =
            await client.PostAsJsonAsync(
                "/api/chat",
                ollamaRequest
            );

        if (!response.IsSuccessStatusCode)
        {
            var error =
                await response.Content.ReadAsStringAsync();

            return Results.Problem(
                title: "Local AI request failed",
                detail: error,
                statusCode: 502
            );
        }


        var ollamaResponse =
            await response.Content
                .ReadFromJsonAsync<OllamaChatResponse>();


        var generatedContent =
            ollamaResponse?.Message?.Content?.Trim();


        if (string.IsNullOrWhiteSpace(generatedContent))
        {
            return Results.Problem(
                title: "Empty AI response",
                detail:
                    "Gemma returned an empty response.",
                statusCode: 502
            );
        }


        return Results.Content(
            generatedContent,
            "application/json"
        );
    }
    catch (HttpRequestException)
    {
        return Results.Problem(
            title: "Cannot connect to Ollama",
            detail:
                "Make sure Ollama is running locally.",
            statusCode: 503
        );
    }
    catch (TaskCanceledException)
    {
        return Results.Problem(
            title: "Generation timed out",
            detail:
                "The local AI model took too long to respond.",
            statusCode: 504
        );
    }
});

app.Run();


// -------------------------------------------------------
// READABLE LABEL HELPERS
// -------------------------------------------------------

static string GetReadableEnvironment(
    string value)
{
    return value switch
    {
        "neighborhood" => "Neighborhood",
        "park" => "Park",
        "garden" => "Garden",
        "trail" => "Trail",
        "beach" => "Beach",
        _ => value
    };
}


static string GetReadableGoal(
    string value)
{
    return value switch
    {
        "move" => "Move my body",
        "explore" => "Explore",
        "notice-nature" => "Notice nature",
        "clear-my-head" => "Clear my head",
        _ => value
    };
}


static string GetReadableActivityLevel(
    string value)
{
    return value switch
    {
        "easy" => "Easy",
        "normal" => "Normal",
        "active" => "Active",
        _ => value
    };
}


static string GetReadableCompanion(
    string value)
{
    return value switch
    {
        "solo" => "Solo",
        "with-someone" => "With someone",
        _ => value
    };
}


// -------------------------------------------------------
// REQUEST MODELS
// -------------------------------------------------------

public record QuestRequest
{
    public int DurationMinutes { get; init; }

    public string Environment { get; init; } = "";

    public string Goal { get; init; } = "";

    public string ActivityLevel { get; init; } = "";

    public string Companion { get; init; } = "";
}


public class OllamaChatRequest
{
    [JsonPropertyName("model")]
    public string Model { get; set; } = "";

    [JsonPropertyName("messages")]
    public List<OllamaMessage> Messages { get; set; } = [];

    [JsonPropertyName("stream")]
    public bool Stream { get; set; }

    [JsonPropertyName("format")]
    public string Format { get; set; } = "";

    [JsonPropertyName("options")]
    public OllamaOptions? Options { get; set; }
}


public class OllamaMessage
{
    [JsonPropertyName("role")]
    public string Role { get; set; } = "";

    [JsonPropertyName("content")]
    public string Content { get; set; } = "";
}


public class OllamaOptions
{
    [JsonPropertyName("temperature")]
    public double Temperature { get; set; }
}


public class OllamaChatResponse
{
    [JsonPropertyName("message")]
    public OllamaMessage? Message { get; set; }
}

public class OllamaTagsResponse
{
    [JsonPropertyName("models")]
    public List<OllamaModelTag>? Models { get; set; }
}

public class OllamaModelTag
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = "";
}