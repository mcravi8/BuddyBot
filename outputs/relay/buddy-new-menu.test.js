'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Menu=require('./buddy-new-menu.js');

test('a new task is named by its first sentence or line, kept short',()=>{
  assert.equal(Menu.titleOf('Check AgentMail and Gmail for new mail. Tell me only what needs me.'),'Check AgentMail and Gmail for new mail');
  assert.equal(Menu.titleOf('Draft the caption wording\nUse the change sheet.'),'Draft the caption wording');
  assert.ok(Menu.titleOf('word '.repeat(60)).length<=80);
  assert.equal(Menu.titleOf('   '),'Task');
});

test('a repeating task runs every day, or once a week on the chosen day, at the chosen time',()=>{
  assert.deepEqual(Menu.schedule('daily','20:00','3'),{hour:20,minute:0,weekdays:[1,2,3,4,5,6,7]});
  assert.deepEqual(Menu.schedule('weekly','07:30','3'),{hour:7,minute:30,weekdays:[3]});
  assert.deepEqual(Menu.schedule('weekly','','9'),{hour:9,minute:0,weekdays:[7]});
});
