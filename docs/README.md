# This is just a test

Just a test to auto render PlantUML

<div class="highlight">

```puml
@startuml
start

if (Graphviz installed?) then (yes)
  :process all\ndiagrams;
else (no)
  :process only
  __sequence__ and __activity__ diagrams;
endif

stop
@enduml
```

</div>

With some stuff in between
