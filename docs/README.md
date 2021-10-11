# This is just a test

Just a test to auto render PlantUML

<!-- puml:123 -->
![alt](generated-assets/123.png)
<details>
    <summary>PlantUML source</summary>

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
</details>
<!-- puml:123 -->

<span style="color:orange">test</span>
<font color="green">test</font>

With some stuff in between
