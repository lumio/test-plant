# Subpage

This is yet another demo page to be linked to.

This also contains a puml:

<!-- puml:b3921c9c2a1a158f946ffcf6e855c48d86b0256b6b57b385f5b4f7e61b63f797 -->
![UML](generated-assets/b3921c9c2a1a158f946ffcf6e855c48d86b0256b6b57b385f5b4f7e61b63f797.svg)
<details>
<summary>source code</summary>

```puml
@startuml

skinparam component {
    FontColor          black
    AttributeFontColor black
    FontSize           17
    AttributeFontSize  15
    AttributeFontname  Droid Sans Mono
    BackgroundColor    #6A9EFF
    BorderColor        black
    ArrowColor         #222266
}

title "OSCIED Charms Relations (Simple)"
skinparam componentStyle uml2

cloud {
    interface "JuJu" as juju
    interface "API" as api
    interface "Storage" as storage
    interface "Transform" as transform
    interface "Publisher" as publisher
    interface "Website" as website

    juju - [JuJu]

    website - [WebUI]
    [WebUI] .up.> juju
    [WebUI] .down.> storage
    [WebUI] .right.> api

    api - [Orchestra]
    transform - [Orchestra]
    publisher - [Orchestra]
    [Orchestra] .up.> juju
    [Orchestra] .down.> storage

    [Transform] .up.> juju
    [Transform] .down.> storage
    [Transform] ..> transform

    [Publisher] .up.> juju
    [Publisher] .down.> storage
    [Publisher] ..> publisher

    storage - [Storage]
    [Storage] .up.> juju
}

@enduml
```
</details>

Diagram from [real-world-plantuml.com](https://real-world-plantuml.com/)
