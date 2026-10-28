import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';

/** Verifies that the root shell can be created with router services. */
describe('App', () => {
  let fixture: ComponentFixture<App>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  /** Creates the root application component. */
  it('creates the root component', () => {
    fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  afterEach(() => fixture?.destroy());
});
